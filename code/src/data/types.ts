/** Typed, normalized records from the participant-facing CSV datasets. */
export type Currency = "EUR" | "IDR" | "INR" | "USD" | "ZAR";
export type RequestType =
  | "debt_repayment"
  | "education"
  | "emergency_expense"
  | "family_transfer"
  | "housing"
  | "investment"
  | "other"
  | "purchase"
  | "travel";
export type EventType =
  | "debt_payment"
  | "expense"
  | "income"
  | "investment_purchase"
  | "investment_sale"
  | "investment_valuation"
  | "refund"
  | "subscription";
export type EventDirection = "credit" | "debit" | "non_cash";

export type EventStatus =
  | "cancelled"
  | "failed"
  | "pending"
  | "scheduled"
  | "settled"
  | "unrealized";
export type Flexibility =
  | "fixed"
  | "reducible"
  | "reducible_or_stoppable"
  | "stoppable";
export type PaymentMethod = "full_payment" | "installments";
export type MessageSourceType =
  | "bank"
  | "employer"
  | "financial_service"
  | "merchant"
  | "service_provider";
export type AffordabilityStatus =
  | "affordable_now"
  | "affordable_with_plan"
  | "affordable_later"
  | "not_affordable";
export type RecommendedPaymentMethod =
  | "full_payment"
  | "partial_payment"
  | "installments"
  | "wait"
  | "not_recommended";
export interface Request {
  requestId: string;
  userId: string;
  requestDate: string;
  requestType: RequestType;
  requestedAmount: number;
  desiredCompletionDate: string;
  allowsPartialPayment: boolean;
  requestText: string;
}
export interface FinancialProfile {
  userId: string;
  homeCurrency: Currency;
  currentAvailableBalance: number;
  minimumBalanceToKeep: number;
  financialPriorities: string;
  expenseCategoriesToProtect: string;
  expenseCategoriesUserIsWillingToReduce: string | null;
  expenseCategoriesUserIsWillingToStop: string | null;
  paymentMethodsUserWillConsider: string;
  maxInstallmentMonths: number | null;
}
export interface FinancialEvent {
  eventId: string;
  userId: string;
  eventType: EventType;
  description: string;
  category: string;
  direction: EventDirection;
  amount: number | null;
  currency: Currency;
  eventDate: string;
  settlementDate: string | null;
  status: EventStatus;
  linkedEventId: string | null;
  flexibility: Flexibility;
  minimumAllowedAmount: number | null;
}
export interface ExchangeRate {
  rateDate: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  rate: number;
}
export interface RequestPaymentOption {
  paymentOptionId: string;
  requestId: string;
  paymentMethod: PaymentMethod;
  paymentAmount: number;
  numberOfPayments: number;
  firstPaymentDate: string;
  paymentFrequencyDays: number | null;
  financingFee: number;
  totalPayableAmount: number;
}
export interface Message {
  messageId: string;
  userId: string;
  requestId: string | null;
  relatedEventId: string | null;
  sentAt: string;
  sourceType: MessageSourceType;
  messageText: string;
}
export interface Image {
  imageId: string;
  userId: string;
  requestId: string;
  relatedEventId: string;
}
export interface SampleRequest extends Request {
  amountSafeToPay: number;
  affordabilityStatus: AffordabilityStatus;
  recommendedPaymentMethod: RecommendedPaymentMethod;
  paymentPlan: string;
  earliestDateForFullPayment: string | null;
  spendingChangesNeeded: string;
  decisionExplanation: string;
}
export interface DataIndexes {
  requestById: Map<string, Request>;
  sampleRequestById: Map<string, SampleRequest>;
  profileByUserId: Map<string, FinancialProfile>;
  eventById: Map<string, FinancialEvent>;
  eventsByUserId: Map<string, FinancialEvent[]>;
  paymentOptionsByRequestId: Map<string, RequestPaymentOption[]>;
  messagesByUserId: Map<string, Message[]>;
  messagesByRequestId: Map<string, Message[]>;
  imagesByRequestId: Map<string, Image[]>;
  imagesByRelatedEventId: Map<string, Image[]>;
  exchangeRateByKey: Map<string, ExchangeRate>;
}
export interface LoadedData {
  requests: Request[];
  sampleRequests: SampleRequest[];
  financialProfiles: FinancialProfile[];
  financialEvents: FinancialEvent[];
  exchangeRates: ExchangeRate[];
  paymentOptions: RequestPaymentOption[];
  messages: Message[];
  images: Image[];
  indexes: DataIndexes;
}

export type StateEventKind =
  | "committed_obligation"
  | "essential_expense"
  | "flexible_expense"
  | "future_income"
  | "pending_debit"
  | "pending_credit"
  | "settled_cash"
  | "excluded";

export interface StateEvent {
  event: FinancialEvent;
  amountInHomeCurrency: number | null;
  kind: StateEventKind;
  cashDate: string | null;
}

export interface FinancialState {
  requestId: string;
  userId: string;
  asOfDate: string;
  homeCurrency: Currency;
  currentAvailableBalance: number;
  minimumBalanceToKeep: number;
  balanceAfterPendingDebits: number;
  pendingDebitsReserved: number;
  pendingCreditsExcluded: number;
  settledIncome: StateEvent[];
  futureConfirmedIncome: StateEvent[];
  recurringExpenses: StateEvent[];
  essentialExpenses: StateEvent[];
  flexibleExpenses: StateEvent[];
  committedObligations: StateEvent[];
  pendingDebits: StateEvent[];
  pendingCredits: StateEvent[];
  settledCashEvents: StateEvent[];
  excludedEvents: StateEvent[];
  allEvents: StateEvent[];
  financialPriorities: string[];
  protectedExpenseCategories: string[];
  reducibleExpenseCategories: string[];
  stoppableExpenseCategories: string[];
  paymentMethodsUserWillConsider: string[];
  maxInstallmentMonths: number | null;
}

export interface ForecastEvent {
  eventId: string;
  eventType: EventType;
  description: string;
  category: string;
  direction: EventDirection;
  amountInHomeCurrency: number;
  sourceAmount: number;
  sourceCurrency: Currency;
  flexibility: Flexibility;
  minimumAllowedAmount: number | null;
  recurring: boolean;
}

export interface ForecastDay {
  date: string;
  startingBalance: number;
  credits: number;
  debits: number;
  endingBalance: number;
  minimumBalanceToKeep: number;
  minimumBalanceViolated: boolean;
  events: ForecastEvent[];
}

export interface FinancialForecast {
  requestId: string;
  userId: string;
  startDate: string;
  endDate: string;
  startingBalance: number;
  minimumBalanceToKeep: number;
  days: ForecastDay[];
  minimumProjectedBalance: number;
  minimumProjectedBalanceDate: string;
}

export type BaselineAffordabilityStatus =
  | "affordable_now"
  | "affordable_later"
  | "not_affordable";

export interface AffordabilityAnalysis {
  requestId: string;
  userId: string;
  requestDate: string;
  desiredCompletionDate: string;
  forecastEndDate: string;
  requestedAmount: number;
  allowsPartialPayment: boolean;
  minimumBalanceToKeep: number;
  startingBalance: number;
  amountSafeToday: number;
  fullAmountSafeToday: boolean;
  fullAmountSafeByDeadline: boolean;
  earliestFullPaymentDate: string | null;
  status: BaselineAffordabilityStatus;
}

export interface PaymentPlanEvaluation {
  paymentOptionId: string;
  requestId: string;
  paymentMethod: PaymentMethod;
  feasible: boolean;
  infeasibilityReason: string | null;
  totalPayableAmount: number;
  financingFee: number;
  paymentDates: string[];
  paymentAmounts: number[];
  minimumProjectedBalanceAfterPlan: number;
  completesByDesiredCompletionDate: boolean;
}

export interface PaymentPlanAnalysis {
  requestId: string;
  userId: string;
  requestedAmount: number;
  desiredCompletionDate: string;
  forecastEndDate: string;
  evaluatedOptions: PaymentPlanEvaluation[];
  rankedFeasibleOptions: PaymentPlanEvaluation[];
  bestFeasiblePaymentOptionId: string | null;
}

export interface FinalDecision {
  requestId: string;
  amountSafeToPay: number;
  affordabilityStatus: AffordabilityStatus;
  recommendedPaymentMethod: RecommendedPaymentMethod;
  paymentPlan: string;
  earliestDateForFullPayment: string | null;
  spendingChangesNeeded: string;
  decisionExplanation: string;
}

export type EvidenceSourceKind = "message" | "image";
export type EvidenceType =
  | "amount_claim"
  | "date_claim"
  | "status_update"
  | "cancellation"
  | "settlement"
  | "amendment"
  | "income_claim"
  | "expense_claim";
export type EvidenceClaimStatus = "cancelled" | "confirmed" | "delayed" | "pending" | "settled" | "updated";

export interface EvidenceFact {
  evidenceType: EvidenceType;
  requestId: string | null;
  eventId: string | null;
  claimedAmount: number | null;
  claimedCurrency: Currency | null;
  claimedDate: string | null;
  claimedStatus: EvidenceClaimStatus | null;
  sourceReference: string;
  confidence: number;
  explanation: string;
}

export interface ValidatedEvidence extends EvidenceFact {
  sourceKind: EvidenceSourceKind;
  sourceId: string;
  sourceSentAt: string;
}

export interface EvidenceReconciliation {
  requestId: string;
  usableEvidence: ValidatedEvidence[];
  rejectedEvidence: Array<{ sourceKind: EvidenceSourceKind; sourceId: string; reason: string }>;
}
