/** Dataset schema types mirror only inspected CSV headers. */

export interface FinancialProfileRow {
  user_id: string; home_currency: string; current_available_balance: string;
  minimum_balance_to_keep: string; financial_priorities: string;
  expense_categories_to_protect: string; expense_categories_user_is_willing_to_reduce: string;
  expense_categories_user_is_willing_to_stop: string; payment_methods_user_will_consider: string;
  max_installment_months: string;
}
export interface FinancialEventRow {
  event_id: string; user_id: string; event_type: string; description: string;
  category: string; direction: string; amount: string; currency: string;
  event_date: string; settlement_date: string; status: string; linked_event_id: string;
  flexibility: string; minimum_allowed_amount: string;
}
export interface ExchangeRateRow { rate_date: string; from_currency: string; to_currency: string; rate: string; }
export interface RequestRow {
  request_id: string; user_id: string; request_date: string; request_type: string;
  requested_amount: string; desired_completion_date: string; allows_partial_payment: string;
  request_text: string;
}
export interface RequestPaymentOptionRow {
  payment_option_id: string; request_id: string; payment_method: string; payment_amount: string;
  number_of_payments: string; first_payment_date: string; payment_frequency_days: string;
  financing_fee: string; total_payable_amount: string;
}
export interface MessageRow {
  message_id: string; user_id: string; request_id: string; related_event_id: string;
  sent_at: string; source_type: string; message_text: string;
}
export interface ImageRow { image_id: string; user_id: string; request_id: string; related_event_id: string; }
export interface OutputRow {
  request_id: string; amount_safe_to_pay: string; affordability_status: string;
  recommended_payment_method: string; payment_plan: string; earliest_date_for_full_payment: string;
  spending_changes_needed: string; decision_explanation: string;
}
export interface SampleRequestRow extends RequestRow, OutputRow {}
/** TODO: define normalized domain models after loader implementation. */
