# Buy or Wait

Terminal TypeScript/Node.js scaffold for the HackerRank Orchestrate financial-affordability challenge. This initialization contains no CSV loading, financial decisions, evidence processing, forecast, or `output.csv` generation.

## Architecture

```text
Raw dataset -> loader -> typed data -> evidence -> financial state -> forecast
-> affordability -> payment plans -> decision engine -> validator -> output.csv
```

| Module | Responsibility |
| --- | --- |
| `main.ts` | Future CLI orchestration point. |
| `src/data/` | Dataset row types and future CSV normalization. |
| `src/evidence/` | Future untrusted message and image evidence handling. |
| `src/finance/` | Future state, 90-day forecast, affordability, and plan analysis. |
| `src/decision/` | Future recommendation selection. |
| `src/validation/` | Future rule and output validation. |
| `src/evaluation/` | Future local sample evaluation. |

## Planned phases

1. Validated CSV loading and normalized models.
2. Evidence reconciliation and financial-state reconstruction.
3. Deterministic forecasting, affordability, and payment plans.
4. Decision validation, sample evaluation, and output writing.

Financial decisions will be deterministic and rule-based wherever possible. Any future AI/LLM use is limited to interpreting unstructured evidence and remains independently validated.

## Build and run

From `code/`:

```text
npm run build
npm run dev
```

The completed solution must read `../dataset/`, write root-level `output.csv`, preserve its exact required schema, use no organizer-only data, and never embed secrets.
