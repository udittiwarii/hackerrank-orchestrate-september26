import type {
	AffordabilityAnalysis,
	FinancialForecast,
	FinancialState,
	FinalDecision,
	PaymentPlanAnalysis,
	Request,
} from "../data/types.js";

const TOLERANCE = 1e-9;

function accepts(state: FinancialState, method: string): boolean {
	return state.paymentMethodsUserWillConsider.includes(method);
}

function formatPaymentPlan(dates: string[], amounts: number[]): string {
	return dates.map((date, index) => `${date}:${amounts[index]}`).join("|");
}

function partialPaymentPlan(
	request: Request,
	state: FinancialState,
	forecast: FinancialForecast,
	affordability: AffordabilityAnalysis,
): string | null {
	const safeToday = affordability.amountSafeToday;
	const completionDate = affordability.earliestFullPaymentDate;
	if (!request.allowsPartialPayment || !accepts(state, "partial_payment")) return null;
	if (safeToday <= TOLERANCE || safeToday >= request.requestedAmount - TOLERANCE) return null;
	if (!completionDate || completionDate > request.desiredCompletionDate || completionDate > forecast.endDate) return null;
	const completionDay = forecast.days.find((day) => day.date === completionDate);
	if (!completionDay) return null;
	const remaining = request.requestedAmount - safeToday;
	if (affordability.startingBalance - safeToday < affordability.minimumBalanceToKeep - TOLERANCE) return null;
	if (completionDay.endingBalance - remaining < affordability.minimumBalanceToKeep - TOLERANCE) return null;
	return formatPaymentPlan([request.requestDate, completionDate], [safeToday, remaining]);
}

function explanation(
	status: FinalDecision["affordabilityStatus"],
	method: FinalDecision["recommendedPaymentMethod"],
	amount: number,
	plan: string,
): string {
	if (method === "full_payment") return `Full payment of ${amount} is safe on the request date while preserving the minimum balance.`;
	if (method === "partial_payment") return `A safe partial payment of ${amount} starts today and completes the request by the stated deadline.`;
	if (method === "installments") return `The selected supplied installment option is feasible, completes by the deadline, and preserves the minimum balance.`;
	if (method === "wait") return `The full amount is not safe today but is forecast to become safe by the stated deadline.`;
	if (status === "not_affordable") return "No permitted supplied plan or baseline full-payment date completes the request safely by the deadline.";
	return `The request is ${status.replaceAll("_", " ")} under the baseline forecast; payment plan: ${plan}.`;
}

/** Combines the deterministic Phase 5 and Phase 6 analyses into one decision. */
export function makeDecision(
	request: Request,
	state: FinancialState,
	forecast: FinancialForecast,
	affordability: AffordabilityAnalysis,
	plans: PaymentPlanAnalysis,
): FinalDecision {
	if (request.requestId !== state.requestId || request.requestId !== forecast.requestId || request.requestId !== affordability.requestId || request.requestId !== plans.requestId) {
		throw new Error(`Decision inputs do not match for ${request.requestId}`);
	}

	const amountSafeToPay = Math.max(0, Math.min(request.requestedAmount, affordability.amountSafeToday));
	const partialPlan = partialPaymentPlan(request, state, forecast, affordability);
	const fullPaymentAllowed = accepts(state, "full_payment");
	let affordabilityStatus: FinalDecision["affordabilityStatus"];
	let recommendedPaymentMethod: FinalDecision["recommendedPaymentMethod"];
	let paymentPlan = "none";
	let earliestDateForFullPayment = affordability.earliestFullPaymentDate;

	if (affordability.fullAmountSafeToday && fullPaymentAllowed) {
		affordabilityStatus = "affordable_now";
		recommendedPaymentMethod = "full_payment";
		paymentPlan = formatPaymentPlan([request.requestDate], [request.requestedAmount]);
		earliestDateForFullPayment = request.requestDate;
	} else if (partialPlan && (!plans.rankedFeasibleOptions[0] || request.requestedAmount <= plans.rankedFeasibleOptions[0].totalPayableAmount)) {
		affordabilityStatus = "affordable_with_plan";
		recommendedPaymentMethod = "partial_payment";
		paymentPlan = partialPlan;
	} else if (plans.rankedFeasibleOptions.length > 0) {
		const selected = plans.rankedFeasibleOptions[0];
		affordabilityStatus = "affordable_with_plan";
		recommendedPaymentMethod = "installments";
		paymentPlan = formatPaymentPlan(selected.paymentDates, selected.paymentAmounts);
	} else if (affordability.fullAmountSafeByDeadline && fullPaymentAllowed) {
		affordabilityStatus = "affordable_later";
		recommendedPaymentMethod = "wait";
		paymentPlan = "none";
	} else {
		affordabilityStatus = "not_affordable";
		recommendedPaymentMethod = "not_recommended";
	}

	return {
		requestId: request.requestId,
		amountSafeToPay,
		affordabilityStatus,
		recommendedPaymentMethod,
		paymentPlan,
		earliestDateForFullPayment,
		spendingChangesNeeded: "none",
		decisionExplanation: explanation(affordabilityStatus, recommendedPaymentMethod, amountSafeToPay, paymentPlan),
	};
}

export function makeAllDecisions(
	requests: Request[],
	states: FinancialState[],
	forecasts: FinancialForecast[],
	affordabilityAnalyses: AffordabilityAnalysis[],
	planAnalyses: PaymentPlanAnalysis[],
): FinalDecision[] {
	const stateByRequest = new Map(states.map((item) => [item.requestId, item]));
	const forecastByRequest = new Map(forecasts.map((item) => [item.requestId, item]));
	const affordabilityByRequest = new Map(affordabilityAnalyses.map((item) => [item.requestId, item]));
	const plansByRequest = new Map(planAnalyses.map((item) => [item.requestId, item]));
	return requests.map((request) => {
		const state = stateByRequest.get(request.requestId);
		const forecast = forecastByRequest.get(request.requestId);
		const affordability = affordabilityByRequest.get(request.requestId);
		const plans = plansByRequest.get(request.requestId);
		if (!state || !forecast || !affordability || !plans) throw new Error(`Missing decision input for ${request.requestId}`);
		return makeDecision(request, state, forecast, affordability, plans);
	});
}
/** Future deterministic decision boundary combining state, forecast, evidence, payment options, and user constraints. No algorithm is implemented yet. */
export {};
