/**
 * Buy or Wait CLI entry point.
 *
 * Planned pipeline: load raw datasets, normalize records, gather evidence,
 * construct financial state, forecast, evaluate plans, decide, validate, and
 * write the required output.csv. This initialization deliberately performs
 * none of those operations.
 */

import { loadDatasets } from "./src/data/loader.js";

const data = loadDatasets();
console.log(`Loaded ${data.requests.length} requests, ${data.sampleRequests.length} sample requests, ${data.financialProfiles.length} profiles, ${data.financialEvents.length} events, ${data.exchangeRates.length} exchange rates, ${data.paymentOptions.length} payment options, ${data.messages.length} messages, and ${data.images.length} images.`);
