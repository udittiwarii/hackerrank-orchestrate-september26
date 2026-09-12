import type { FinancialForecast, FinancialState, ForecastDay, ForecastEvent, StateEvent } from "../data/types.js";

const DAY_MS = 86_400_000;
const HORIZON_DAYS = 90;

function parseDate(date: string): Date {
	const value = new Date(`${date}T00:00:00Z`);
	if (Number.isNaN(value.valueOf()) || value.toISOString().slice(0, 10) !== date) throw new Error(`Invalid dataset date: ${date}`);
	return value;
}

function dateString(value: Date): string {
	return value.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
	return Math.round((parseDate(end).valueOf() - parseDate(start).valueOf()) / DAY_MS);
}

function eventDate(item: StateEvent): string | null {
	return item.cashDate;
}

function asForecastEvent(item: StateEvent, amountInHomeCurrency: number, recurring: boolean, projectedDate?: string): ForecastEvent {
	return {
		eventId: projectedDate ? `${item.event.eventId}@${projectedDate}` : item.event.eventId,
		eventType: item.event.eventType,
		description: item.event.description,
		category: item.event.category,
		direction: item.event.direction,
		amountInHomeCurrency,
		sourceAmount: item.event.amount!,
		sourceCurrency: item.event.currency,
		flexibility: item.event.flexibility,
		minimumAllowedAmount: item.event.minimumAllowedAmount,
		recurring
	};
}

function recurringKey(item: StateEvent): string {
	return [item.event.eventType, item.event.category, item.event.description, item.event.direction].join("|");
}

function median(values: number[]): number {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.floor(sorted.length / 2)];
}

interface RecurringSeries {
	template: StateEvent;
	amountInHomeCurrency: number;
	intervalDays: number;
	lastDate: string;
}

function recurringSeries(state: FinancialState): RecurringSeries[] {
	const groups = new Map<string, StateEvent[]>();
	for (const item of state.recurringExpenses) {
		if (!item.cashDate || item.cashDate > state.asOfDate || item.amountInHomeCurrency === null) continue;
		const key = recurringKey(item);
		groups.set(key, [...(groups.get(key) ?? []), item]);
	}
	const series: RecurringSeries[] = [];
	for (const events of groups.values()) {
		const ordered = [...events].sort((left, right) => eventDate(left)!.localeCompare(eventDate(right)!));
		const gaps = ordered.slice(1).map((item, index) => daysBetween(eventDate(ordered[index])!, eventDate(item)!)).filter((gap) => gap > 0);
		if (gaps.length === 0) continue;
		const intervalDays = median(gaps);
		if (intervalDays <= 0) continue;
		const template = ordered[ordered.length - 1];
		series.push({ template, amountInHomeCurrency: template.amountInHomeCurrency!, intervalDays, lastDate: template.cashDate! });
	}
	return series;
}

function projectedRecurringEvents(state: FinancialState, startDate: string, endDate: string): Map<string, ForecastEvent[]> {
	const result = new Map<string, ForecastEvent[]>();
	for (const series of recurringSeries(state)) {
		let next = new Date(parseDate(series.lastDate).valueOf() + series.intervalDays * DAY_MS);
		while (dateString(next) <= endDate) {
			const date = dateString(next);
			if (date >= startDate) {
				const event = asForecastEvent(series.template, series.amountInHomeCurrency, true, date);
				result.set(date, [...(result.get(date) ?? []), event]);
			}
			next = new Date(next.valueOf() + series.intervalDays * DAY_MS);
		}
	}
	return result;
}

function scheduledEvents(state: FinancialState, startDate: string, endDate: string): Map<string, ForecastEvent[]> {
	const result = new Map<string, ForecastEvent[]>();
	const candidates = [...state.futureConfirmedIncome, ...state.committedObligations];
	for (const item of candidates) {
		const date = eventDate(item);
		if (!date || date < startDate || date > endDate || item.amountInHomeCurrency === null) continue;
		const event = asForecastEvent(item, item.amountInHomeCurrency, false);
		result.set(date, [...(result.get(date) ?? []), event]);
	}
	return result;
}

function buildDays(state: FinancialState, startDate: string, endDate: string, startingBalance: number): ForecastDay[] {
	const eventsByDate = new Map<string, ForecastEvent[]>();
	for (const [date, events] of scheduledEvents(state, startDate, endDate)) eventsByDate.set(date, [...(eventsByDate.get(date) ?? []), ...events]);
	for (const [date, events] of projectedRecurringEvents(state, startDate, endDate)) eventsByDate.set(date, [...(eventsByDate.get(date) ?? []), ...events]);
	const days: ForecastDay[] = [];
	let balance = startingBalance;
	let cursor = parseDate(startDate);
	while (dateString(cursor) <= endDate) {
		const date = dateString(cursor);
		const events = (eventsByDate.get(date) ?? []).sort((left, right) => left.eventId.localeCompare(right.eventId, undefined, { numeric: true }));
		const credits = events.filter((event) => event.direction === "credit").reduce((sum, event) => sum + event.amountInHomeCurrency, 0);
		const debits = events.filter((event) => event.direction === "debit").reduce((sum, event) => sum + event.amountInHomeCurrency, 0);
		const starting = balance;
		balance = starting + credits - debits;
		days.push({ date, startingBalance: starting, credits, debits, endingBalance: balance, minimumBalanceToKeep: state.minimumBalanceToKeep, minimumBalanceViolated: balance < state.minimumBalanceToKeep, events });
		cursor = new Date(cursor.valueOf() + DAY_MS);
	}
	return days;
}

/** Builds the baseline request-date-through-request-date-plus-89-days projection. */
export function forecastFinancialState(state: FinancialState): FinancialForecast {
	const start = parseDate(state.asOfDate);
	const endDate = dateString(new Date(start.valueOf() + (HORIZON_DAYS - 1) * DAY_MS));
	const startingBalance = state.balanceAfterPendingDebits;
	const days = buildDays(state, state.asOfDate, endDate, startingBalance);
	const minimumDay = days.reduce((minimum, day) => day.endingBalance < minimum.endingBalance ? day : minimum, days[0]);
	return { requestId: state.requestId, userId: state.userId, startDate: state.asOfDate, endDate, startingBalance, minimumBalanceToKeep: state.minimumBalanceToKeep, days, minimumProjectedBalance: minimumDay.endingBalance, minimumProjectedBalanceDate: minimumDay.date };
}
/** Future 90-day forecast boundary. Its safety invariant keeps projected balances above the user's minimum. No forecast logic is implemented yet. */
export {};
