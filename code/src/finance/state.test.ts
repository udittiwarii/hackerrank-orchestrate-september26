import assert from "node:assert/strict";
import { loadDatasets } from "../data/loader.js";
import { reconstructAllFinancialStates, reconstructFinancialState } from "./state.js";

const data = loadDatasets("../dataset");
const states = reconstructAllFinancialStates(data);

assert.equal(states.length, data.requests.length, "every prediction request must produce one state");
assert.equal(states.length, 250, "the real evaluation dataset must contain 250 requests");
assert.equal(new Set(states.map((state) => state.requestId)).size, states.length, "states must be keyed by request ID");

for (const state of states) {
  assert.equal(state.allEvents.length, (data.indexes.eventsByUserId.get(state.userId) ?? []).length);
  assert.ok(state.balanceAfterPendingDebits <= state.currentAvailableBalance);
  assert.ok(state.allEvents.every((item) => item.event.userId === state.userId));
  assert.ok(state.allEvents.every((item) => item.event.direction === "non_cash" ? item.amountInHomeCurrency === null : true));
  assert.ok(state.excludedEvents.every((item) => item.kind === "excluded"));
  assert.ok(state.pendingCredits.every((item) => item.amountInHomeCurrency !== null));
  assert.ok(state.futureConfirmedIncome.every((item) => item.event.eventType === "income"));
}

const pendingDebitState = states.find((state) => state.pendingDebits.length > 0);
assert.ok(pendingDebitState, "real data must exercise pending debit reservation");
assert.equal(
  pendingDebitState.pendingDebitsReserved,
  pendingDebitState.pendingDebits.reduce((sum, item) => sum + (item.amountInHomeCurrency ?? 0), 0),
  "pending debit reserve must use fixed converted amounts"
);

const pendingCreditState = states.find((state) => state.pendingCredits.length > 0);
assert.ok(pendingCreditState, "real data must exercise pending credit exclusion");
assert.ok(pendingCreditState.pendingCredits.every((item) => item.kind === "pending_credit"));

const linkedDuplicate = states.flatMap((state) => state.allEvents).find((item) => {
  const linked = item.event.linkedEventId ? data.indexes.eventById.get(item.event.linkedEventId) : undefined;
  return linked?.status === "settled"
    && linked.eventType === item.event.eventType
    && linked.direction === item.event.direction
    && linked.amount === item.event.amount
    && item.event.status !== "settled";
});
assert.ok(linkedDuplicate, "real data must exercise linked lifecycle records");
assert.equal(linkedDuplicate.kind, "excluded", "a superseded linked duplicate must not reserve or count twice");

const first = reconstructFinancialState(data, data.requests[0].requestId);
assert.equal(first.asOfDate, data.requests[0].requestDate, "state dates must use dataset dates without local timezone conversion");
console.log(`Validated ${states.length} real-data financial states and deterministic event rules.`);