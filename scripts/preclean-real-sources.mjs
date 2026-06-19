import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { DATA_DIR } from "./data-dir.mjs";

await mkdir(DATA_DIR, { recursive: true });

const inputPath = path.join(DATA_DIR, "real-source-mentions.json");
const acceptedPath = path.join(DATA_DIR, "real-source-mentions-preclean.json");
const rejectedPath = path.join(DATA_DIR, "real-source-mentions-rejected-preclean.json");
const acceptedCsvPath = path.join(DATA_DIR, "real-source-mentions-preclean.csv");

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

function isNoiseCompany(companyName) {
  const lower = companyName.toLowerCase();

  const exactNoise = new Set([
    "",
    "unknown",
    "n/a",
    "na",
    "none",
    "null",
    "remote",
    "job",
    "jobs",
    "career",
    "careers",
    "hiring",
    "apply",
    "work from home"
  ]);

  if (exactNoise.has(lower)) return true;
  if (companyName.length < 2) return true;
  if (/^\d+$/.test(companyName)) return true;

  return false;
}

let rows = [];

try {
  rows = JSON.parse(await readFile(inputPath, "utf8"));
} catch {
  rows = [];
}

const accepted = [];
const rejected = [];
const seen = new Set();

for (const row of rows) {
  const companyName = companyNameOf(row);
  const sourceName = sourceNameOf(row);
  const signal = signalOf(row);
  const url = urlOf(row);

  if (isNoiseCompany(companyName)) {
    rejected.push({
      ...row,
      companyName,
      sourceName,
      signal,
      url,
      precleanStatus: "rejected",
      rejectReason: "invalid_or_noise_company_name",
      precleanedAt: new Date().toISOString()
    });
    continue;
  }

  const key = [
    companyName.toLowerCase(),
    sourceName.toLowerCase(),
    url.toLowerCase(),
    signal.toLowerCase()
  ].join("|");

  if (seen.has(key)) continue;
  seen.add(key);

  accepted.push({
    ...row,
    companyName,
    sourceName,
    signal,
    url,
    precleanStatus: "accepted",
    precleanedAt: new Date().toISOString()
  });
}

/**
 * Hard safety fallback:
 * A live run should never move from >0 raw rows to 0 accepted rows.
 * If that happens, keep normalized raw rows as accepted so qualification can continue.
 */
const finalAccepted =
  accepted.length > 0
    ? accepted
    : rows
        .map((row) => {
          const companyName = companyNameOf(row);
          if (!companyName) return null;

          return {
            ...row,
            companyName,
            sourceName: sourceNameOf(row),
            signal: signalOf(row),
            url: urlOf(row),
            precleanStatus: "accepted_fallback",
            precleanedAt: new Date().toISOString()
          };
        })
        .filter(Boolean);

await writeFile(acceptedPath, JSON.stringify(finalAccepted, null, 2));
await writeFile(rejectedPath, JSON.stringify(rejected, null, 2));

const csvHeader = [
  "companyName",
  "sourceName",
  "signal",
  "url",
  "precleanStatus"
];

const csvRows = finalAccepted.map((row) =>
  [
    row.companyName,
    row.sourceName,
    row.signal,
    row.url,
    row.precleanStatus
  ].map(csvEscape).join(",")
);

await writeFile(acceptedCsvPath, [csvHeader.join(","), ...csvRows].join("\n") + "\n");

console.log("Pre-clean complete");
console.log(`Raw rows: ${rows.length}`);
console.log(`Accepted rows: ${finalAccepted.length}`);
console.log(`Rejected rows: ${rejected.length}`);
console.log(`Unique accepted companies: ${new Set(finalAccepted.map((row) => row.companyName.toLowerCase())).size}`);

if (accepted.length === 0 && rows.length > 0) {
  console.warn("Pre-clean fallback used: raw rows were normalized and accepted to protect live run.");
}
