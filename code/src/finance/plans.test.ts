import assert from "node:assert/strict";
import { loadDatasets } from "../data/loader.js";
import { reconstructAllFinancialStates } from "./state.js";
import { forecastFinancialState } from "./forecast.js";
import { analyzeAllPaymentPlans } from "./plans.js";

const data = loadDatasets("../dataset");
const states = reconstructAllFinancialStates(data);
const forecasts = states.map(forecastFinancialState);
const analyses = analyzeAllPaymentPlans(data.requests, states, forecasts, data.paymentOptions);
const evaluationOptions = data.paymentOptions.filter((option) => data.indexes.requestById.has(option.requestId));

assert.equal(analyses.length, 250);
assert.equal(analyses.reduce((sum, analysis) => sum + analysis.evaluatedOptions.length, 0), evaluationOptions.length);
assert.equal(new Set(analyses.flatMap((analysis) => analysis.evaluatedOptions.map((option) => option.paymentOptionId))).size, evaluationOptions.length);

for (const analysis of analyses) {
  const request = data.indexes.requestById.get(analysis.requestId)!;
  const state = states.find((item) => item.requestId === analysis.requestId)!;
  const forecast = forecasts.find((item) => item.requestId === analysis.requestId)!;
  const suppliedIds = new Set(data.paymentOptions.filter((option) => option.requestId === request.requestId).map((option) => option.paymentOptionId));
  assert.ok(analysis.evaluatedOptions.every((option) => suppliedIds.has(option.paymentOptionId)));
  assert.ok(analysis.evaluatedOptions.every((option) => option.paymentDates.length === option.paymentAmounts.length));
  assert.ok(analysis.evaluatedOptions.every((option) => option.paymentDates.every((date) => date >= request.requestDate)) || analysis.evaluatedOptions.length === 0);
  for (const option of analysis.evaluatedOptions) {
    const source = data.paymentOptions.find((item) => item.paymentOptionId === option.paymentOptionId)!;
    assert.deepEqual(option.paymentAmounts, option.paymentDates.map(() => source.paymentAmount));
    assert.equal(option.totalPayableAmount, source.totalPayableAmount);
    assert.equal(option.financingFee, source.financingFee);
    if (option.feasible) {
      assert.equal(option.infeasibilityReason, null);
      assert.ok(option.completesByDesiredCompletionDate);
      assert.ok(option.paymentDates.every((date) => date <= request.desiredCompletionDate && date <= forecast.endDate));
      assert.ok(option.minimumProjectedBalanceAfterPlan >= forecast.minimumBalanceToKeep - 1e-9);
      assert.ok(state.paymentMethodsUserWillConsider.includes(option.paymentMethod));
      if (option.paymentMethod === "installments" && state.maxInstallmentMonths !== null) {
        const lastDate = option.paymentDates.at(-1)!;
        const limit = new Date(`${source.firstPaymentDate}T00:00:00Z`);
        limit.setUTCMonth(limit.getUTCMonth() + state.maxInstallmentMonths);
        assert.ok(lastDate <= limit.toISOString().slice(0, 10));
      }
    } else {
      assert.ok(option.infeasibilityReason);
      if (option.infeasibilityReason === "payment_method_not_allowed") assert.ok(!state.paymentMethodsUserWillConsider.includes(option.paymentMethod));
      if (option.infeasibilityReason === "payment_after_desired_completion_date") assert.ok(option.paymentDates.some((date) => date > request.desiredCompletionDate));
      if (option.infeasibilityReason === "payment_outside_forecast") assert.ok(option.paymentDates.some((date) => date > forecast.endDate));
      if (option.infeasibilityReason === "payment_below_minimum_balance") assert.ok(option.minimumProjectedBalanceAfterPlan < forecast.minimumBalanceToKeep);
    }
  }
  const ranked = analysis.rankedFeasibleOptions;
  for (let index = 1; index < ranked.length; index++) {
    const previous = ranked[index - 1];
    const current = ranked[index];
    assert.ok(previous.totalPayableAmount < current.totalPayableAmount
      || (previous.totalPayableAmount === current.totalPayableAmount && (previous.paymentDates[0] < current.paymentDates[0]
        || (previous.paymentDates[0] === current.paymentDates[0] && (previous.paymentDates.length < current.paymentDates.length
          || (previous.paymentDates.length === current.paymentDates.length && previous.paymentOptionId.localeCompare(current.paymentOptionId, undefined, { numeric: true }) < 0))))));
  }
}

const pendingCreditIds = new Set(states.flatMap((state) => state.pendingCredits.map((item) => item.event.eventId)));
assert.ok(pendingCreditIds.size > 0);
for (const forecast of forecasts) for (const day of forecast.days) for (const event of day.events) assert.ok(!pendingCreditIds.has(event.eventId));
for (const forecast of forecasts) {
  const state = states.find((item) => item.requestId === forecast.requestId)!;
  for (const pending of state.pendingDebits) assert.ok(!forecast.days.some((day) => day.events.some((event) => event.eventId === pending.event.eventId)));
}

const rerun = analyzeAllPaymentPlans(data.requests, states, forecasts, data.paymentOptions);
assert.deepEqual(analyses, rerun, "payment-plan analysis must be deterministic");
console.log(`Validated ${analyses.length} requests and ${evaluationOptions.length} supplied payment options.`);