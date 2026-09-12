import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDatasets } from "../data/loader.js";
import { decisionsToCsv, runPipeline, writeOutputCsv } from "../../main.js";
import { validateOutputFile } from "./validator.js";

const data = loadDatasets("../dataset");
const first = runPipeline(data);
const outputPath = resolve(process.cwd(), "../output.csv");
writeOutputCsv(first.decisions, outputPath);
const validation = validateOutputFile(outputPath, data, first.decisions);
assert.equal(validation.errors.length, 0, validation.errors.join("\n"));
assert.equal(validation.rowCount, 250);

const second = runPipeline(data);
assert.equal(decisionsToCsv(first.decisions), decisionsToCsv(second.decisions));
assert.equal(readFileSync(outputPath, "utf8"), decisionsToCsv(first.decisions));
console.log("Validated end-to-end output generation, validation, 250 rows, and deterministic repeatability.");
