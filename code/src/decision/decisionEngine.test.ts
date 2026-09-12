import assert from "node:assert/strict";
import { loadDatasets } from "../data/loader.js";
import { reconstructAllFinancialStates } from "../finance/state.js";
import { forecastFinancialState } from "../finance/forecast.js";
import { analyzeAffordability } from "../finance/affordability.js";
import { analyzeAllPaymentPlans } from "../finance/plans.js";
import { makeAllDecisions } from "./decisionEngine.js";

const data = loadDatasets("../dataset");
const states = reconstructAllFinancialStates(data);
const forecasts = states.map(forecastFinancialState);
const affordability = data.requests.map((request, index) => analyzeAffordability(request, forecasts[index]));
const plans = analyzeAllPaymentPlans(data.requests, states, forecasts, data.paymentOptions);
const decisions = makeAllDecisions(data.requests, states, forecasts, affordability, plans);

assert.equal(decisions.length, 250);
assert.equal(new Set(decisions.map((decision) => decision.requestId)).size, 250);

const statuses = new Set(["affordable_now", "affordable_with_plan", "affordable_later", "not_affordable"]);
const methods = new Set(["full_payment", "partial_payment", "installments", "wait", "not_recommended"]);

for (const decision of decisions) {
  const request = data.indexes.requestById.get(decision.requestId)!;
  const state = states.find((item) => item.requestId === decision.requestId)!;
  const forecast = forecasts.find((item) => item.requestId === decision.requestId)!;
  const analysis = affordability.find((item) => item.requestId === decision.requestId)!;
  const planAnalysis = plans.find((item) => item.requestId === decision.requestId)!;
  assert.ok(statuses.has(decision.affordabilityStatus));
  assert.ok(methods.has(decision.recommendedPaymentMethod));
  assert.ok(decision.amountSafeToPay >= 0);
  assert.ok(decision.amountSafeToPay <= request.requestedAmount);
  assert.equal(decision.spendingChangesNeeded, "none");
  if (decision.earliestDateForFullPayment !== null) {
    assert.ok(decision.earliestDateForFullPayment >= request.requestDate);
    assert.ok(decision.earliestDateForFullPayment <= request.desiredCompletionDate);
    assert.ok(decision.earliestDateForFullPayment <= forecast.endDate);
  }
  if (decision.recommendedPaymentMethod === "full_payment") {
    assert.equal(decision.affordabilityStatus, "affordable_now");
    assert.equal(decision.paymentPlan, `${request.requestDate}:${request.requestedAmount}`);
    assert.ok(analysis.fullAmountSafeToday);
    assert.ok(state.paymentMethodsUserWillConsider.includes("full_payment"));
  }
  if (decision.recommendedPaymentMethod === "installments") {
    assert.equal(decision.affordabilityStatus, "affordable_with_plan");
    const selected = planAnalysis.rankedFeasibleOptions.find((option) => option.paymentOptionId === planAnalysis.bestFeasiblePaymentOptionId)!;
    assert.ok(selected);
    assert.equal(decision.paymentPlan, selected.paymentDates.map((date, index) => `${date}:${selected.paymentAmounts[index]}`).join("|"));
    assert.ok(selected.feasible);
  }
  if (decision.recommendedPaymentMethod === "partial_payment") {
    assert.equal(decision.affordabilityStatus, "affordable_with_plan");
    const payments = decision.paymentPlan.split("|");
    assert.equal(payments.length, 2);
    assert.equal(payments[0], `${request.requestDate}:${analysis.amountSafeToday}`);
    assert.ok(request.allowsPartialPayment);
    assert.ok(state.paymentMethodsUserWillConsider.includes("partial_payment"));
    const firstAmount = Number(payments[0].split(":")[1]);
    const secondAmount = Number(payments[1].split(":")[1]);
    assert.ok(firstAmount > 0 && firstAmount < request.requestedAmount);
    assert.equal(firstAmount + secondAmount, request.requestedAmount);
    assert.ok(payments[1].split(":")[0] <= request.desiredCompletionDate);
  }
  if (decision.recommendedPaymentMethod === "wait") {
    assert.equal(decision.affordabilityStatus, "affordable_later");
    assert.ok(analysis.fullAmountSafeByDeadline);
    assert.ok(state.paymentMethodsUserWillConsider.includes("full_payment"));
    assert.equal(decision.paymentPlan, "none");
  }
  if (decision.recommendedPaymentMethod === "not_recommended") {
    assert.equal(decision.affordabilityStatus, "not_affordable");
    assert.equal(decision.paymentPlan, "none");
  }
}

const rerun = makeAllDecisions(data.requests, states, forecasts, affordability, plans);
assert.deepEqual(decisions, rerun, "decision results must be deterministic");

const statusCounts = Object.fromEntries([...statuses].map((status) => [status, decisions.filter((decision) => decision.affordabilityStatus === status).length]));
const methodCounts = Object.fromEntries([...methods].map((method) => [method, decisions.filter((decision) => decision.recommendedPaymentMethod === method).length]));
console.log(JSON.stringify({ requests: decisions.length, statusCounts, methodCounts }));