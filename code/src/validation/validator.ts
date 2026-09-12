import { existsSync, readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import type { FinalDecision, LoadedData } from "../data/types.js";
import { OUTPUT_HEADERS, runPipeline } from "../../main.js";

const AFFORDABILITY_STATUSES = new Set(["affordable_now", "affordable_with_plan", "affordable_later", "not_affordable"]);
const PAYMENT_METHODS = new Set(["full_payment", "partial_payment", "installments", "wait", "not_recommended"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ValidationResult { rowCount: number; errors: string[]; }

function addError(errors: string[], row: number, message: string): void { errors.push(`row ${row}: ${message}`); }

function parsePlan(plan: string): Array<{ date: string; amount: number }> | null {
	if (plan === "none") return [];
	const payments = plan.split("|").map((item) => {
		const separator = item.lastIndexOf(":");
		if (separator <= 0) return null;
		const date = item.slice(0, separator);
		const amount = Number(item.slice(separator + 1));
		return DATE_PATTERN.test(date) && Number.isFinite(amount) && amount >= 0 ? { date, amount } : null;
	});
	return payments.every((payment) => payment !== null) ? payments as Array<{ date: string; amount: number }> : null;
}

export function validateOutputFile(outputPath: string, data: LoadedData, expectedDecisions?: FinalDecision[]): ValidationResult {
	const errors: string[] = [];
	if (!existsSync(outputPath)) return { rowCount: 0, errors: [`output file does not exist: ${outputPath}`] };
	let rows: Record<string, string>[];
	try {
		rows = parse(readFileSync(outputPath, "utf8"), { columns: true, skip_empty_lines: true, relax_column_count: false, bom: true });
	} catch (error) {
		return { rowCount: 0, errors: [`invalid CSV: ${error instanceof Error ? error.message : String(error)}`] };
	}
	const headers = Object.keys(rows[0] ?? {});
	if (headers.length !== OUTPUT_HEADERS.length || headers.some((header, index) => header !== OUTPUT_HEADERS[index])) errors.push("headers do not exactly match the required output schema");
	if (rows.length !== data.requests.length) errors.push(`expected ${data.requests.length} data rows, received ${rows.length}`);
	const requestIds = new Set(data.requests.map((request) => request.requestId));
	const seen = new Set<string>();
	const decisions = expectedDecisions ?? runPipeline(data).decisions;
	const expectedById = new Map(decisions.map((decision) => [decision.requestId, decision]));

	for (const [index, row] of rows.entries()) {
		const rowNumber = index + 2;
		const request = data.indexes.requestById.get(row.request_id);
		if (!request || !requestIds.has(row.request_id)) addError(errors, rowNumber, `unknown request_id ${row.request_id}`);
		if (seen.has(row.request_id)) addError(errors, rowNumber, `duplicate request_id ${row.request_id}`);
		seen.add(row.request_id);
		const amount = Number(row.amount_safe_to_pay);
		if (!Number.isFinite(amount) || amount < 0) addError(errors, rowNumber, "amount_safe_to_pay must be numeric and non-negative");
		if (request && amount > request.requestedAmount + 1e-9) addError(errors, rowNumber, "amount_safe_to_pay exceeds requested amount");
		if (!AFFORDABILITY_STATUSES.has(row.affordability_status)) addError(errors, rowNumber, "invalid affordability_status");
		if (!PAYMENT_METHODS.has(row.recommended_payment_method)) addError(errors, rowNumber, "invalid recommended_payment_method");
		if (row.earliest_date_for_full_payment && !DATE_PATTERN.test(row.earliest_date_for_full_payment)) addError(errors, rowNumber, "invalid earliest full-payment date");
		const plan = parsePlan(row.payment_plan);
		if (plan === null) addError(errors, rowNumber, "invalid payment_plan format");
		if (plan && request && plan.some((payment) => payment.date > request.desiredCompletionDate)) addError(errors, rowNumber, "payment_plan exceeds desired completion date");
		if (plan && row.recommended_payment_method === "partial_payment" && plan.length !== 2) addError(errors, rowNumber, "partial payment must contain exactly two payments");
		if (plan && row.recommended_payment_method === "not_recommended" && plan.length !== 0) addError(errors, rowNumber, "not_recommended must have payment_plan none");
		const expected = expectedById.get(row.request_id);
		if (expected) {
			const actual: Array<string | number | null> = [amount, row.affordability_status, row.recommended_payment_method, row.payment_plan, row.earliest_date_for_full_payment || null, row.spending_changes_needed, row.decision_explanation];
			const wanted: Array<string | number | null> = [expected.amountSafeToPay, expected.affordabilityStatus, expected.recommendedPaymentMethod, expected.paymentPlan, expected.earliestDateForFullPayment, expected.spendingChangesNeeded, expected.decisionExplanation];
			actual.forEach((value, fieldIndex) => { if (value !== wanted[fieldIndex]) addError(errors, rowNumber, `output differs from deterministic decision at field ${fieldIndex + 1}`); });
		}
	}
	for (const request of data.requests) if (!seen.has(request.requestId)) errors.push(`missing request_id ${request.requestId}`);
	return { rowCount: rows.length, errors };
}

if (process.argv[1]?.endsWith("validator.ts") || process.argv[1]?.endsWith("validator.js")) {
	const data = (await import("../data/loader.js")).loadDatasets();
	const result = validateOutputFile(process.argv[2] ?? "../output.csv", data);
	if (result.errors.length > 0) { console.error(result.errors.join("\n")); process.exitCode = 1; }
	else console.log(`Validated ${result.rowCount} output rows.`);
}
