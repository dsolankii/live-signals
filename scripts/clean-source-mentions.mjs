import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { DATA_DIR } from "./data-dir.mjs";

await mkdir(DATA_DIR, { recursive: true });

const inputPath = path.join(DATA_DIR, "real-source-mentions.json");
const csvPath = path.join(DATA_DIR, "real-source-mentions.csv");

function text(value) {
  return String(value || "").trim();
}

function companyNameOf(row) {
  return text(
    row.companyName ||
      row.company ||
      row.name ||
      row.organizationName ||
      row.organization ||
      row.employer ||
      row.accountName ||
      row.title
  );
}

function sourceNameOf(row) {
  return text(
    row.sourceName ||
      row.source ||
      row.sourceType ||
      row.channel ||
      row.origin ||
      row.feedName ||
      "Live source"
  );
}

function signalOf(row) {
  return (
    text(row.signal) ||
    text(row.reason) ||
    text(row.description) ||
    text(row.snippet) ||
    text(row.title) ||
    "Live source signal"
  );
}

function urlOf(row) {
  return text(row.url || row.sourceUrl || row.link || row.applyUrl || row.companyUrl);
}

function csvEscape(value) {
  const s = String(value || "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

let rows = [];

try {
  rows = JSON.parse(await readFile(inputPath, "utf8"));
} catch {
  rows = [];
}

const cleaned = [];
const rejected = [];
const seen = new Set();

for (const row of rows) {
  const companyName = companyNameOf(row);
  const sourceName = sourceNameOf(row);
  const signal = signalOf(row);
  const url = urlOf(row);

  if (!companyName || companyName.length < 2) {
    rejected.push({ ...row, rejectReason: "missing_company_name" });
    continue;
  }

  const lower = companyName.toLowerCase();

  const obviousNoise =
    lower === "unknown" ||
    lower === "n/a" ||
    lower === "remote" ||
    lower === "job" ||
    lower === "jobs" ||
    lower === "hiring" ||
    lower === "careers";

  if (obviousNoise) {
    rejected.push({ ...row, rejectReason: "obvious_noise_company_name" });
    continue;
  }

  const normalized = {
    ...row,
    companyName,
    sourceName,
    signal,
    url,
    cleanedAt: new Date().toISOString()
  };

  const key = [
    companyName.toLowerCase(),
    sourceName.toLowerCase(),
    url.toLowerCase(),
    signal.toLowerCase()
  ].join("|");

  if (seen.has(key)) continue;
  seen.add(key);

  cleaned.push(normalized);
}

/**
 * Safety rule:
 * If cleaner removes everything, keep normalized raw rows instead of killing the live run.
 */
const finalRows = cleaned.length > 0 ? cleaned : rows.map((row) => ({
  ...row,
  companyName: companyNameOf(row) || text(row.title) || "Unknown company",
  sourceName: sourceNameOf(row),
  signal: signalOf(row),
  url: urlOf(row),
  cleanedAt: new Date().toISOString(),
  cleanupFallback: true
}));

await writeFile(inputPath, JSON.stringify(finalRows, null, 2));

const csvHeader = [
  "companyName",
  "sourceName",
  "signal",
  "url"
];

const csvRows = finalRows.map((row) =>
  [
    row.companyName,
    row.sourceName,
    row.signal,
    row.url
  ].map(csvEscape).join(",")
);

await writeFile(csvPath, [csvHeader.join(","), ...csvRows].join("\n") + "\n");

console.log("Source mentions cleaned");
console.log(`Before: ${rows.length}`);
console.log(`Cleaned: ${cleaned.length}`);
console.log(`Rejected by cleaner: ${rejected.length}`);
console.log(`Final rows kept: ${finalRows.length}`);

if (cleaned.length === 0 && rows.length > 0) {
  console.warn("Cleaner fallback used: kept normalized raw rows to protect live run.");
}
