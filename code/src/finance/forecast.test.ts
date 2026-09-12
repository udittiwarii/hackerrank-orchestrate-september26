import assert from "node:assert/strict";
import { loadDatasets } from "../data/loader.js";
import { reconstructAllFinancialStates } from "./state.js";
import { forecastFinancialState } from "./forecast.js";

const data = loadDatasets("../dataset");
const states = reconstructAllFinancialStates(data);
const forecasts = states.map(forecastFinancialState);

assert.equal(forecasts.length, 250);
for (const forecast of forecasts) {
  assert.equal(forecast.days.length, 90);
  assert.equal(forecast.startDate, data.indexes.requestById.get(forecast.requestId)!.requestDate);
  assert.equal(forecast.endDate, forecast.days[89].date);
  assert.equal(forecast.days[0].date, forecast.startDate);
  assert.equal(forecast.startingBalance, states.find((state) => state.requestId === forecast.requestId)!.balanceAfterPendingDebits);
  assert.equal(forecast.minimumProjectedBalance, Math.min(...forecast.days.map((day) => day.endingBalance)));
  assert.ok(forecast.days.every((day) => day.minimumBalanceViolated === (day.endingBalance < day.minimumBalanceToKeep)));
}

const withFutureIncome = forecasts.find((forecast) => forecast.days.some((day) => day.credits > 0));
assert.ok(withFutureIncome, "real data must exercise future confirmed income");
const incomeState = states.find((state) => state.requestId === withFutureIncome.requestId)!;
for (const item of incomeState.pendingCredits) assert.ok(!withFutureIncome.days.some((day) => day.events.some((event) => event.eventId === item.event.eventId)));
for (const item of incomeState.futureConfirmedIncome) {
  const date = item.cashDate!;
  if (date >= withFutureIncome.startDate && date <= withFutureIncome.endDate) assert.ok(withFutureIncome.days.find((day) => day.date === date)!.events.some((event) => event.eventId === item.event.eventId));
}

const withPendingDebit = forecasts.find((forecast) => states.find((state) => state.requestId === forecast.requestId)!.pendingDebits.length > 0);
assert.ok(withPendingDebit, "real data must exercise pending debit reserves");
const pendingState = states.find((state) => state.requestId === withPendingDebit.requestId)!;
for (const item of pendingState.pendingDebits) assert.ok(!withPendingDebit.days.some((day) => day.events.some((event) => event.eventId === item.event.eventId)), "pending debit must not be reserved twice");

const withRecurring = forecasts.find((forecast) => forecast.days.some((day) => day.events.some((event) => event.recurring)));
assert.ok(withRecurring, "real data must exercise recurring projections");
assert.ok(withRecurring.days.some((day) => day.events.some((event) => event.recurring && event.direction === "debit")));

const excludedEventIds = new Set(data.financialEvents.filter((event) => ["failed", "cancelled", "unrealized"].includes(event.status) || event.direction === "non_cash" || event.amount === null).map((event) => event.eventId));
for (const forecast of forecasts) {
  for (const day of forecast.days) for (const event of day.events) {
    assert.ok(event.sourceCurrency, "forecast events retain source currency");
    assert.ok(!excludedEventIds.has(event.eventId), "excluded events must not enter the forecast");
  }
  const ids = forecast.days.flatMap((day) => day.events.map((event) => event.eventId));
  assert.equal(new Set(ids).size, ids.length, "forecast event identifiers must be unique");
}

const convertedState = states.find((state) => state.futureConfirmedIncome.some((item) => item.event.currency !== state.homeCurrency && item.amountInHomeCurrency !== null));
if (convertedState) {
  const source = convertedState.futureConfirmedIncome.find((item) => item.event.currency !== convertedState.homeCurrency)!;
  const forecast = forecasts.find((item) => item.requestId === convertedState.requestId)!;
  const projected = forecast.days.flatMap((day) => day.events).find((event) => event.eventId === source.event.eventId);
  assert.ok(projected, "converted future income must be projected");
  const rate = data.indexes.exchangeRateByKey.get(`${source.event.settlementDate ?? source.event.eventDate}|${source.event.currency}|${convertedState.homeCurrency}`)!;
  assert.equal(projected.amountInHomeCurrency, source.event.amount! * rate.rate, "forecast must use the supplied fixed exchange rate");
}
console.log(`Validated ${forecasts.length} real-data 90-day forecasts.`);