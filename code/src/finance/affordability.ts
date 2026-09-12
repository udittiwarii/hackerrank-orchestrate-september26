import type { AffordabilityAnalysis, FinancialForecast, Request } from "../data/types.js";

const TOLERANCE = 1e-9;

function safeDifference(balance: number, minimumBalance: number): number {
	return balance - minimumBalance;
}

function isPaymentSafe(balance: number, payment: number, minimumBalance: number): boolean {
	return safeDifference(balance, payment + minimumBalance) >= -TOLERANCE;
}

function validateRequestForecast(request: Request, forecast: FinancialForecast): void {
	if (request.requestId !== forecast.requestId || request.userId !== forecast.userId) throw new Error(`Request and forecast do not match for ${request.requestId}`);
	if (request.requestDate !== forecast.startDate) throw new Error(`Forecast does not start on request date for ${request.requestId}`);
	if (request.desiredCompletionDate < request.requestDate) throw new Error(`Request deadline precedes request date for ${request.requestId}`);
}

/**
 * Calculates baseline payment capacity without applying the purchase. Today
 * uses the forecast day's pre-event starting balance; later dates use the
 * post-baseline-event ending balance for that date.
 */
export function analyzeAffordability(request: Request, forecast: FinancialForecast): AffordabilityAnalysis {
	validateRequestForecast(request, forecast);
	const today = forecast.days[0];
	if (!today || today.date !== request.requestDate) throw new Error(`Forecast has no request-date day for ${request.requestId}`);
	const requestedAmount = Math.max(0, request.requestedAmount);
	const todayCapacity = Math.max(0, safeDifference(today.startingBalance, forecast.minimumBalanceToKeep));
	const amountSafeToday = Math.min(requestedAmount, todayCapacity);
	const fullAmountSafeToday = isPaymentSafe(today.startingBalance, requestedAmount, forecast.minimumBalanceToKeep);
	const deadlineDate = request.desiredCompletionDate <= forecast.endDate ? request.desiredCompletionDate : null;
	const eligibleDays = deadlineDate === null ? [] : forecast.days.filter((day) => day.date >= request.requestDate && day.date <= deadlineDate);
	const earliestFullPaymentDate = fullAmountSafeToday
		? request.requestDate
		: eligibleDays.find((day) => day.date > request.requestDate && isPaymentSafe(day.endingBalance, requestedAmount, forecast.minimumBalanceToKeep))?.date ?? null;
	const fullAmountSafeByDeadline = earliestFullPaymentDate !== null;
	const status = fullAmountSafeToday ? "affordable_now" : fullAmountSafeByDeadline ? "affordable_later" : "not_affordable";
	return {
		requestId: request.requestId,
		userId: request.userId,
		requestDate: request.requestDate,
		desiredCompletionDate: request.desiredCompletionDate,
		forecastEndDate: forecast.endDate,
		requestedAmount,
		allowsPartialPayment: request.allowsPartialPayment,
		minimumBalanceToKeep: forecast.minimumBalanceToKeep,
		startingBalance: today.startingBalance,
		amountSafeToday,
		fullAmountSafeToday,
		fullAmountSafeByDeadline,
		earliestFullPaymentDate: fullAmountSafeToday ? request.requestDate : earliestFullPaymentDate,
		status
	};
}
