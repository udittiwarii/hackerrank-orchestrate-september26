# Buy or Wait

Terminal TypeScript/Node.js foundation for the HackerRank Orchestrate financial-affordability challenge. The typed data layer is implemented; financial decisions, evidence interpretation, forecasts, and `output.csv` generation are not.

## Architecture

```text
Raw dataset -> loader -> typed data -> evidence -> financial state -> forecast
-> affordability -> payment plans -> decision engine -> validator -> output.csv
```

| Module | Responsibility |
| --- | --- |
| `main.ts` | Loads datasets, builds indexes, and prints a concise count summary. |
| `src/data/` | Typed CSV normalization, structural validation, and lookup indexes. |
| `src/evidence/` | Future untrusted message and image evidence handling. |
| `src/finance/` | Future state, 90-day forecast, affordability, and plan analysis. |
| `src/decision/` | Future recommendation selection. |
| `src/validation/` | Future rule and output validation. |
| `src/evaluation/` | Future local sample evaluation. |

## Planned phases

1. Evidence reconciliation and financial-state reconstruction.
2. Deterministic forecasting, affordability, and payment plans.
3. Decision validation, sample evaluation, and output writing.

Financial decisions will be deterministic and rule-based wherever possible. Any future AI/LLM use is limited to interpreting unstructured evidence and remains independently validated.

## Build and run

From `code/`, install dependencies and run:

```text
npm run build
npm run dev
```

`npm run dev` loads `../dataset/`; invoking the compiled program from the repository root also finds `dataset/` there.

## Data Layer

The loader reads `requests.csv`, `sample_requests.csv`, `financial_profiles.csv`, `financial_events.csv`, `exchange_rates.csv`, `request_payment_options.csv`, `messages.csv`, and `images.csv`. Its interfaces mirror the inspected headers and convert numeric fields to `number`, booleans to `boolean`, and observed blank nullable fields to `null`—not zero. Dates remain validated `YYYY-MM-DD` strings and message timestamps remain validated timestamp strings.

It validates required headers, missing files, malformed CSV, numeric and date values, observed enum values, and duplicate primary/composite IDs. Errors identify the dataset, row, column, and problem. It uses `csv-parse` for quoted fields, embedded commas, escaped quotes, and newline-safe parsing.

`loadDatasets()` returns normalized arrays plus `Map` indexes for request/profile/event IDs, events by user, payment options by request, messages by user/request, images by request/related event, and dated currency-pair rates. The loader preserves raw business facts; it does not apply affordability or financial interpretation.

### Phase 3: financial state reconstruction

`src/finance/state.ts` reconstructs a deterministic `FinancialState` for each request before the requested purchase is applied. It uses the profile's available balance and minimum balance, retains protected/reducible/stoppable category permissions, classifies historical expenses and future committed obligations, preserves confirmed future income, and exposes pending debit reserves separately from pending credits.

Only settled cash events affect settled cash classifications. Failed, cancelled, unrealized, non-cash, and amount-missing records are excluded from spendable cash; pending debits are reserved and pending credits are not available. Linked records are deduplicated only when the linked record is a same-type, same-direction settled equivalent. Distinct linked cash events such as refunds, investment sales, or valuation records remain distinct, with unrealized/non-cash values never treated as spendable. Foreign cash events use the fixed exchange-rate row for their settlement date and currency direction.

Forecasting, affordability, payment plans, spending changes, evidence interpretation, and output generation remain future phases. `src/finance/state.test.ts` runs deterministic checks against all 250 real requests without creating synthetic financial data.

### Phase 4: 90-day forecast

`src/finance/forecast.ts` projects the baseline from the request date through request date plus 89 days, inclusive. It starts at the Phase 3 balance after reserving pending debits, never adds pending credits, and does not replay historical settled cash. Future confirmed income and committed obligations are applied on their settlement/effective dates. Repeated historical expenses represented by the same event type, category, description, and direction are projected using their median observed positive interval; their latest observed converted amount, flexibility, and minimum amount are preserved. This is the dataset's only recurring representation; no message or live banking data is consulted.

Dates are parsed and advanced at UTC midnight, so local timezone settings cannot change the horizon. Every `ForecastDay` exposes starting balance, credits, debits, ending balance, applied events, and minimum-balance violation status. The forecast reports the minimum ending balance and date but does not decide affordability or apply the requested purchase. Projected recurrence is necessarily limited where a user has fewer than two observed occurrences or irregular history, and no Phase 4 spending changes are applied.

### Phase 5: deterministic affordability analysis

`src/finance/affordability.ts` computes baseline payment capacity without applying a purchase or selecting a payment plan. The safe amount today is capped at the request amount and is calculated from the request-date pre-event balance minus `minimumBalanceToKeep`; pending debit reserves are already included in that balance by Phase 3. Future full-payment checks use each forecast day's post-baseline-event ending balance, stop at the requested completion date and 90-day forecast boundary, and return the earliest safe date. Results distinguish `affordable_now`, `affordable_later`, and `not_affordable`; partial-payment permission is preserved for later phases but does not cause a plan here. A small `1e-9` numerical tolerance handles binary floating-point representation only.

### Phase 6: deterministic payment-plan analysis

`src/finance/plans.ts` evaluates only the payment options supplied for each request. It expands each option's supplied payment amount and schedule, checks accepted payment methods and installment-month limits, enforces the request deadline and 90-day forecast boundary, and simulates each payment after baseline forecast cash flow. Pending debits are already reflected in the Phase 3 starting balance and are not reserved again; pending credits and excluded event types never enter the forecast.

Each evaluated option exposes its feasibility, supplied dates and amounts, financing fee, total payable amount, completion status, and minimum balance after the plan. Feasible options are ranked by the challenge order: completion by deadline, no spending changes, total cost, earlier start, fewer payments, then lowest option ID. This phase does not invent partial-payment plans, apply spending changes, or make the final recommendation.

The completed solution must write root-level `output.csv`, preserve its exact required schema, use no organizer-only data, and never embed secrets.
