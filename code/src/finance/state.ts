import type { ExchangeRate, FinancialEvent, FinancialState, LoadedData, StateEvent, StateEventKind } from "../data/types.js";

const TERMINAL_EXCLUDED_STATUSES = new Set(["failed", "cancelled", "unrealized"]);
const FLEXIBLE_VALUES = new Set(["reducible", "reducible_or_stoppable", "stoppable"]);

function splitPreference(value: string | null): string[] {
	return value ? value.split("|").map((item) => item.trim()).filter(Boolean) : [];
}

function compareEvents(left: StateEvent, right: StateEvent): number {
	return left.event.eventId.localeCompare(right.event.eventId, undefined, { numeric: true });
}

function rateFor(event: FinancialEvent, homeCurrency: string, rates: Map<string, ExchangeRate>): number {
	if (event.currency === homeCurrency) return 1;
	const date = event.settlementDate ?? event.eventDate;
	const rate = rates.get(`${date}|${event.currency}|${homeCurrency}`);
	if (!rate) throw new Error(`Missing fixed exchange rate for ${date} ${event.currency}->${homeCurrency} (${event.eventId})`);
	return rate.rate;
}

function amountInHomeCurrency(event: FinancialEvent, homeCurrency: string, rates: Map<string, ExchangeRate>): number | null {
	return event.amount === null ? null : event.amount * rateFor(event, homeCurrency, rates);
}

function hasPriorOccurrence(event: FinancialEvent, events: FinancialEvent[]): boolean {
	return events.some((candidate) => candidate.eventId !== event.eventId
		&& candidate.eventType === event.eventType
		&& candidate.category === event.category
		&& candidate.description === event.description
		&& candidate.direction === event.direction
		&& candidate.eventDate < event.eventDate
		&& candidate.status === "settled");
}

function hasSettledLinkedEquivalent(event: FinancialEvent, events: FinancialEvent[]): boolean {
	if (!event.linkedEventId || event.status === "settled") return false;
	return events.some((candidate) => candidate.status === "settled"
		&& candidate.eventId === event.linkedEventId
		&& candidate.eventType === event.eventType
		&& candidate.direction === event.direction
		&& candidate.amount === event.amount);
}

function classify(event: FinancialEvent, requestDate: string, userEvents: FinancialEvent[], protectedCategories: Set<string>): StateEventKind {
	if (TERMINAL_EXCLUDED_STATUSES.has(event.status) || event.direction === "non_cash" || event.amount === null || hasSettledLinkedEquivalent(event, userEvents)) return "excluded";
	if (event.status === "pending") return event.direction === "debit" ? "pending_debit" : "pending_credit";
	if ((event.status === "scheduled" || event.status === "settled") && event.eventType === "income" && event.direction === "credit" && (event.settlementDate ?? event.eventDate) > requestDate) return "future_income";
	if (event.direction === "credit") return event.status === "settled" ? "settled_cash" : "excluded";
	if (event.status === "scheduled" || (event.status === "settled" && (event.settlementDate ?? event.eventDate) > requestDate)) return "committed_obligation";
	if (event.eventType === "income") return "settled_cash";
	if (hasPriorOccurrence(event, userEvents)) return protectedCategories.has(event.category) || !FLEXIBLE_VALUES.has(event.flexibility) ? "essential_expense" : "flexible_expense";
	return protectedCategories.has(event.category) || !FLEXIBLE_VALUES.has(event.flexibility) ? "essential_expense" : "flexible_expense";
}

function stateEvent(event: FinancialEvent, kind: StateEventKind, homeCurrency: string, rates: Map<string, ExchangeRate>): StateEvent {
	return { event, amountInHomeCurrency: kind === "excluded" ? null : amountInHomeCurrency(event, homeCurrency, rates), kind, cashDate: event.settlementDate ?? event.eventDate };
}

function sortEvents(events: StateEvent[]): StateEvent[] {
	return [...events].sort((left, right) => (left.cashDate ?? "").localeCompare(right.cashDate ?? "") || compareEvents(left, right));
}

/**
 * Reconstructs the user's position immediately before a request. This module
 * classifies records only; forecast and purchase-plan calculations belong to
 * later phases.
 */
export function reconstructFinancialState(data: LoadedData, requestId: string): FinancialState {
	const request = data.indexes.requestById.get(requestId);
	if (!request) throw new Error(`Unknown request ${requestId}`);
	const profile = data.indexes.profileByUserId.get(request.userId);
	if (!profile) throw new Error(`Missing financial profile for ${request.userId}`);
	const userEvents = data.indexes.eventsByUserId.get(request.userId) ?? [];
	const protectedCategories = new Set(splitPreference(profile.expenseCategoriesToProtect));
	const rates = data.indexes.exchangeRateByKey;
	const allEvents = sortEvents(userEvents.map((event) => stateEvent(event, classify(event, request.requestDate, userEvents, protectedCategories), profile.homeCurrency, rates)));
	const byKind = (kind: StateEventKind) => allEvents.filter((item) => item.kind === kind);
	const pendingDebits = byKind("pending_debit");
	const pendingCredits = byKind("pending_credit");
	const pendingDebitsReserved = pendingDebits.reduce((sum, item) => sum + (item.amountInHomeCurrency ?? 0), 0);
	return {
		requestId,
		userId: request.userId,
		asOfDate: request.requestDate,
		homeCurrency: profile.homeCurrency,
		currentAvailableBalance: profile.currentAvailableBalance,
		minimumBalanceToKeep: profile.minimumBalanceToKeep,
		balanceAfterPendingDebits: profile.currentAvailableBalance - pendingDebitsReserved,
		pendingDebitsReserved,
		pendingCreditsExcluded: pendingCredits.reduce((sum, item) => sum + (item.amountInHomeCurrency ?? 0), 0),
		settledIncome: sortEvents(allEvents.filter((item) => item.kind === "settled_cash" && item.event.eventType === "income")),
		futureConfirmedIncome: byKind("future_income"),
		recurringExpenses: sortEvents(allEvents.filter((item) => (item.kind === "essential_expense" || item.kind === "flexible_expense") && hasPriorOccurrence(item.event, userEvents))),
		essentialExpenses: byKind("essential_expense"),
		flexibleExpenses: byKind("flexible_expense"),
		committedObligations: byKind("committed_obligation"),
		pendingDebits,
		pendingCredits,
		settledCashEvents: byKind("settled_cash"),
		excludedEvents: byKind("excluded"),
		allEvents,
		financialPriorities: splitPreference(profile.financialPriorities),
		protectedExpenseCategories: splitPreference(profile.expenseCategoriesToProtect),
		reducibleExpenseCategories: splitPreference(profile.expenseCategoriesUserIsWillingToReduce),
		stoppableExpenseCategories: splitPreference(profile.expenseCategoriesUserIsWillingToStop),
		paymentMethodsUserWillConsider: splitPreference(profile.paymentMethodsUserWillConsider),
		maxInstallmentMonths: profile.maxInstallmentMonths
	};
}

export function reconstructAllFinancialStates(data: LoadedData): FinancialState[] {
	return data.requests.map((request) => reconstructFinancialState(data, request.requestId));
}
