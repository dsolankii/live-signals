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

  if (!lower || lower.length < 2) return true;
  if (/^\d+$/.test(lower)) return true;

  return new Set([
    "unknown",
    "n/a",
    "na",
    "null",
    "none",
    "job",
    "jobs",
    "career",
    "careers",
    "hiring",
    "apply",
    "remote",
    "work from home"
  ]).has(lower);
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

  const normalized = {
    ...row,
    companyName,
    sourceName,
    signal,
    url,
    precleanedAt: new Date().toISOString()
  };

  if (isNoiseCompany(companyName)) {
    rejected.push({
      ...normalized,
      precleanStatus: "rejected",
      rejectReason: "noise_or_missing_company"
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
    ...normalized,
    precleanStatus: "accepted"
  });
}

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

const csvHeader = ["companyName", "sourceName", "signal", "url", "precleanStatus"];
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

const uniqueCompanies = new Set(
  finalAccepted.map((row) => String(row.companyName || "").toLowerCase()).filter(Boolean)
).size;

console.log("Pre-clean complete");
console.log(`Raw rows: ${rows.length}`);
console.log(`Accepted rows: ${finalAccepted.length}`);
console.log(`Rejected rows: ${rejected.length}`);
console.log(`Unique accepted companies: ${uniqueCompanies}`);

if (accepted.length === 0 && rows.length > 0) {
  console.warn("Pre-clean fallback used: accepted normalized raw rows to protect this fresh run.");
}
