/**
 * Buy or Wait CLI entry point.
 *
 * Planned pipeline: load raw datasets, normalize records, gather evidence,
 * construct financial state, forecast, evaluate plans, decide, validate, and
 * write the required output.csv. This initialization deliberately performs
 * none of those operations.
 */



import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeAffordability } from "./src/finance/affordability.js";
import { analyzeAllPaymentPlans } from "./src/finance/plans.js";
import { makeAllDecisions } from "./src/decision/decisionEngine.js";
import { loadDatasets } from "./src/data/loader.js";
import type { AffordabilityAnalysis, FinalDecision, FinancialForecast, FinancialState, LoadedData, PaymentPlanAnalysis } from "./src/data/types.js";
import { forecastFinancialState } from "./src/finance/forecast.js";
import { reconstructAllFinancialStates } from "./src/finance/state.js";

export const OUTPUT_HEADERS = [
    "request_id", "amount_safe_to_pay", "affordability_status", "recommended_payment_method",
    "payment_plan", "earliest_date_for_full_payment", "spending_changes_needed", "decision_explanation",
] as const;

export interface PipelineResult {
    data: LoadedData;
    states: FinancialState[];
    forecasts: FinancialForecast[];
    affordability: AffordabilityAnalysis[];
    plans: PaymentPlanAnalysis[];
    decisions: FinalDecision[];
}

export function runPipeline(data = loadDatasets()): PipelineResult {
    const states = reconstructAllFinancialStates(data);
    const forecasts = states.map(forecastFinancialState);
    const affordability = data.requests.map((request, index) => analyzeAffordability(request, forecasts[index]));
    const plans = analyzeAllPaymentPlans(data.requests, states, forecasts, data.paymentOptions);
    const decisions = makeAllDecisions(data.requests, states, forecasts, affordability, plans);
    return { data, states, forecasts, affordability, plans, decisions };
}

function csvCell(value: string | number): string {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function decisionsToCsv(decisions: FinalDecision[]): string {
    const rows = decisions.map((decision) => [
        decision.requestId, decision.amountSafeToPay, decision.affordabilityStatus,
        decision.recommendedPaymentMethod, decision.paymentPlan, decision.earliestDateForFullPayment ?? "",
        decision.spendingChangesNeeded, decision.decisionExplanation,
    ].map(csvCell).join(","));
    return `${OUTPUT_HEADERS.join(",")}\n${rows.join("\n")}\n`;
}

export function writeOutputCsv(decisions: FinalDecision[], outputPath = resolve(process.cwd(), "..", "output.csv")): string {
    writeFileSync(outputPath, decisionsToCsv(decisions), "utf8");
    return outputPath;
}

if (process.argv[1]?.endsWith("main.ts") || process.argv[1]?.endsWith("main.js")) {
    const result = runPipeline();
    console.log(`Generated ${result.decisions.length} decisions at ${writeOutputCsv(result.decisions)}.`);
}
