import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { DATA_DIR } from "./data-dir.mjs";

await mkdir(DATA_DIR, { recursive: true });

const filePath = path.join(DATA_DIR, "real-source-mentions.json");

function cleanText(value) {
  return String(value || "").trim();
}

function pickCompanyName(row) {
  return cleanText(
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

function pickSourceName(row) {
  return cleanText(
    row.sourceName ||
      row.source ||
      row.sourceType ||
      row.channel ||
      row.origin ||
      row.feedName ||
      "Live source"
  );
}

let rows = [];

try {
  rows = JSON.parse(await readFile(filePath, "utf8"));
} catch {
  rows = [];
}

const normalized = [];
const seen = new Set();

for (const row of rows) {
  const companyName = pickCompanyName(row);

  if (!companyName) continue;

  const sourceName = pickSourceName(row);
  const signal =
    cleanText(row.signal || row.reason || row.description || row.snippet || row.title) ||
    "Live source signal";

  const normalizedRow = {
    ...row,
    companyName,
    sourceName,
    signal,
    normalizedAt: new Date().toISOString()
  };

  const key = [
    companyName.toLowerCase(),
    sourceName.toLowerCase(),
    cleanText(row.url || row.sourceUrl || row.link).toLowerCase(),
    signal.toLowerCase()
  ].join("|");

  if (seen.has(key)) continue;
  seen.add(key);

  normalized.push(normalizedRow);
}

await writeFile(filePath, JSON.stringify(normalized, null, 2));

console.log("Raw company mentions normalized");
console.log(`Before: ${rows.length}`);
console.log(`After: ${normalized.length}`);
