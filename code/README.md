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

The completed solution must write root-level `output.csv`, preserve its exact required schema, use no organizer-only data, and never embed secrets.
