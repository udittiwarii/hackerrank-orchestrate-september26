import assert from "node:assert/strict";
import { loadDatasets } from "../data/loader.js";
import { reconstructAllFinancialStates } from "./state.js";
import { forecastFinancialState } from "./forecast.js";
import { analyzeAffordability } from "./affordability.js";

const data = loadDatasets("../dataset");
const states = reconstructAllFinancialStates(data);
const forecasts = states.map(forecastFinancialState);
const requests = data.requests;
const results = requests.map((request, index) => analyzeAffordability(request, forecasts[index]));

assert.equal(results.length, 250);
assert.equal(new Set(results.map((result) => result.requestId)).size, 250);
for (const result of results) {
  assert.ok(result.amountSafeToday >= 0);
  assert.ok(result.amountSafeToday <= result.requestedAmount);
  assert.ok(result.amountSafeToday <= result.startingBalance - result.minimumBalanceToKeep + 1e-9 || result.amountSafeToday === result.requestedAmount);
  assert.ok(["affordable_now", "affordable_later", "not_affordable"].includes(result.status));
  assert.equal(result.fullAmountSafeToday, result.earliestFullPaymentDate === result.requestDate);
  assert.equal(result.fullAmountSafeByDeadline, result.earliestFullPaymentDate !== null);
  if (result.earliestFullPaymentDate !== null) {
    assert.ok(result.earliestFullPaymentDate >= result.requestDate);
    assert.ok(result.earliestFullPaymentDate <= result.desiredCompletionDate);
    assert.ok(result.earliestFullPaymentDate <= result.forecastEndDate);
  }
  const forecast = forecasts.find((item) => item.requestId === result.requestId)!;
  const requestDay = forecast.days[0];
  assert.ok(requestDay.startingBalance - result.amountSafeToday >= result.minimumBalanceToKeep - 1e-9);
  if (result.amountSafeToday < result.requestedAmount) {
    assert.ok(requestDay.startingBalance - (result.amountSafeToday + 1e-7) < result.minimumBalanceToKeep || result.amountSafeToday === 0);
  }
}

const pendingCreditEventIds = new Set(states.flatMap((state) => state.pendingCredits.map((item) => item.event.eventId)));
assert.ok(pendingCreditEventIds.size > 0);
for (const forecast of forecasts) for (const day of forecast.days) for (const event of day.events) assert.ok(!pendingCreditEventIds.has(event.eventId));
for (const forecast of forecasts) {
  const state = states.find((item) => item.requestId === forecast.requestId)!;
  for (const pending of state.pendingDebits) assert.ok(!forecast.days.some((day) => day.events.some((event) => event.eventId === pending.event.eventId)));
}

const rerun = requests.map((request, index) => analyzeAffordability(request, forecastFinancialState(states[index])));
assert.deepEqual(results, rerun, "affordability results must be deterministic");
console.log(`Validated ${results.length} real-data affordability analyses.`);