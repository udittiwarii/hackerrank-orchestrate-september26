import type { FinancialForecast, FinancialState, PaymentPlanAnalysis, PaymentPlanEvaluation, Request, RequestPaymentOption } from "../data/types.js";

const TOLERANCE = 1e-9;
const DAY_MS = 86_400_000;

function parseDate(date: string): Date {
	const value = new Date(`${date}T00:00:00Z`);
	if (Number.isNaN(value.valueOf()) || value.toISOString().slice(0, 10) !== date) throw new Error(`Invalid date ${date}`);
	return value;
}

function dateString(value: Date): string {
	return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
	return dateString(new Date(parseDate(date).valueOf() + days * DAY_MS));
}

function addMonths(date: string, months: number): string {
	const source = parseDate(date);
	const year = source.getUTCFullYear();
	const month = source.getUTCMonth() + months;
	const day = source.getUTCDate();
	const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	return dateString(new Date(Date.UTC(year, month, Math.min(day, lastDay))));
}

function preferenceList(value: string[]): Set<string> {
	return new Set(value);
}

function optionPaymentDates(option: RequestPaymentOption): string[] {
	if (option.paymentMethod === "full_payment") return [option.firstPaymentDate];
	if (option.paymentFrequencyDays === null) return [];
	return Array.from({ length: option.numberOfPayments }, (_, index) => addDays(option.firstPaymentDate, index * option.paymentFrequencyDays!));
}

function baseEvaluation(option: RequestPaymentOption, paymentDates: string[]): PaymentPlanEvaluation {
	return {
		paymentOptionId: option.paymentOptionId,
		requestId: option.requestId,
		paymentMethod: option.paymentMethod,
		feasible: false,
		infeasibilityReason: null,
		totalPayableAmount: option.totalPayableAmount,
		financingFee: option.financingFee,
		paymentDates,
		paymentAmounts: paymentDates.map(() => option.paymentAmount),
		minimumProjectedBalanceAfterPlan: Number.POSITIVE_INFINITY,
		completesByDesiredCompletionDate: false
	};
}

function rejected(option: PaymentPlanEvaluation, reason: string): PaymentPlanEvaluation {
	return { ...option, infeasibilityReason: reason };
}

function evaluateOption(request: Request, state: FinancialState, forecast: FinancialForecast, option: RequestPaymentOption): PaymentPlanEvaluation {
	const paymentDates = optionPaymentDates(option);
	let evaluation = baseEvaluation(option, paymentDates);
	if (paymentDates.length === 0) return rejected(evaluation, "installment_frequency_missing");
	if (!preferenceList(state.paymentMethodsUserWillConsider).has(option.paymentMethod)) return rejected(evaluation, "payment_method_not_allowed");
	if (paymentDates.some((date) => date < request.requestDate)) return rejected(evaluation, "payment_before_request_date");
	if (paymentDates.some((date) => date > forecast.endDate)) return rejected(evaluation, "payment_outside_forecast");
	const completesByDesiredCompletionDate = paymentDates.every((date) => date <= request.desiredCompletionDate);
	evaluation = { ...evaluation, completesByDesiredCompletionDate };
	if (!completesByDesiredCompletionDate) return rejected(evaluation, "payment_after_desired_completion_date");
	if (option.paymentMethod === "installments" && state.maxInstallmentMonths !== null) {
		const lastDate = paymentDates[paymentDates.length - 1];
		if (lastDate > addMonths(option.firstPaymentDate, state.maxInstallmentMonths)) return rejected(evaluation, "installment_duration_exceeds_maximum");
	}
	const daysByDate = new Map(forecast.days.map((day) => [day.date, day]));
	let minimumBalance = Number.POSITIVE_INFINITY;
	for (const day of forecast.days) {
		if (day.date < request.requestDate) continue;
		const paymentIndexes = paymentDates.flatMap((date, index) => date === day.date ? [index] : []);
		let balance = day.endingBalance;
		for (const index of paymentIndexes) {
			balance -= option.paymentAmount;
			minimumBalance = Math.min(minimumBalance, balance);
			if (balance < forecast.minimumBalanceToKeep - TOLERANCE) return rejected({ ...evaluation, minimumProjectedBalanceAfterPlan: minimumBalance }, "payment_below_minimum_balance");
		}
	}
	if (minimumBalance === Number.POSITIVE_INFINITY) minimumBalance = forecast.days[0].endingBalance;
	if (!daysByDate.has(paymentDates[paymentDates.length - 1])) return rejected(evaluation, "payment_outside_forecast");
	return { ...evaluation, feasible: true, infeasibilityReason: null, minimumProjectedBalanceAfterPlan: minimumBalance };
}

function comparePlans(left: PaymentPlanEvaluation, right: PaymentPlanEvaluation): number {
	if (left.completesByDesiredCompletionDate !== right.completesByDesiredCompletionDate) return left.completesByDesiredCompletionDate ? -1 : 1;
	if (left.totalPayableAmount !== right.totalPayableAmount) return left.totalPayableAmount - right.totalPayableAmount;
	if (left.paymentDates[0] !== right.paymentDates[0]) return left.paymentDates[0].localeCompare(right.paymentDates[0]);
	if (left.paymentDates.length !== right.paymentDates.length) return left.paymentDates.length - right.paymentDates.length;
	return left.paymentOptionId.localeCompare(right.paymentOptionId, undefined, { numeric: true });
}

/** Evaluates only payment options supplied for this request; it does not create a recommendation. */
export function analyzePaymentPlans(request: Request, state: FinancialState, forecast: FinancialForecast, options: RequestPaymentOption[]): PaymentPlanAnalysis {
	if (request.requestId !== state.requestId || request.requestId !== forecast.requestId) throw new Error(`Request, state, and forecast do not match for ${request.requestId}`);
	const evaluatedOptions = options.filter((option) => option.requestId === request.requestId).map((option) => evaluateOption(request, state, forecast, option));
	const rankedFeasibleOptions = evaluatedOptions.filter((option) => option.feasible).sort(comparePlans);
	return {
		requestId: request.requestId,
		userId: request.userId,
		requestedAmount: request.requestedAmount,
		desiredCompletionDate: request.desiredCompletionDate,
		forecastEndDate: forecast.endDate,
		evaluatedOptions,
		rankedFeasibleOptions,
		bestFeasiblePaymentOptionId: rankedFeasibleOptions[0]?.paymentOptionId ?? null
	};
}

export function analyzeAllPaymentPlans(requests: Request[], states: FinancialState[], forecasts: FinancialForecast[], options: RequestPaymentOption[]): PaymentPlanAnalysis[] {
	const stateByRequest = new Map(states.map((state) => [state.requestId, state]));
	const forecastByRequest = new Map(forecasts.map((forecast) => [forecast.requestId, forecast]));
	return requests.map((request) => {
		const state = stateByRequest.get(request.requestId);
		const forecast = forecastByRequest.get(request.requestId);
		if (!state || !forecast) throw new Error(`Missing state or forecast for ${request.requestId}`);
		return analyzePaymentPlans(request, state, forecast, options);
	});
}
/** Future payment-plan boundary for full, partial, installment, wait, and permitted spending-change scenarios. No evaluation is implemented yet. */
export {};
