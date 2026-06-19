import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { DATA_DIR } from "./data-dir.mjs";

const mode = process.argv[2] || "snapshot";

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8"));
  } catch {
    return fallback;
  }
}

function companyNameOf(row) {
  return String(
    row?.companyName ||
      row?.company ||
      row?.name ||
      row?.organizationName ||
      row?.organization ||
      row?.employer ||
      row?.accountName ||
      row?.title ||
      ""
  ).trim();
}

function uniqueCount(rows, key = "companyName") {
  return new Set(
    rows
      .map((row) =>
        key === "companyName"
          ? companyNameOf(row).toLowerCase()
          : String(row?.[key] || "").trim().toLowerCase()
      )
      .filter(Boolean)
  ).size;
}

function sourceCount(rows) {
  const values = rows
    .map((row) => row?.sourceName || row?.source || row?.sourceType || row?.url)
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  return new Set(values).size;
}

await mkdir(DATA_DIR, { recursive: true });

const run = await readJson("current-live-run.json", null);
const raw = await readJson("real-source-mentions.json", []);
const preclean = await readJson("real-source-mentions-preclean.json", []);
const rejected = await readJson("real-source-mentions-rejected-preclean.json", []);
const reviewed = await readJson("ai-enriched-company-leads.json", []);
const leads = await readJson("company-dashboard-leads.json", []);

const statusMap = {
  start: {
    activeStep: "signal_scan",
    status: "running",
    label: "Starting fresh live run"
  },
  extract: {
    activeStep: "signal_scan",
    status: "running",
    label: "Scanning live sources"
  },
  extract_done: {
    activeStep: "signal_scan",
    status: "complete",
    label: "Signal scan complete"
  },
  preclean: {
    activeStep: "preclean",
    status: "running",
    label: "Cleaning source mentions"
  },
  preclean_done: {
    activeStep: "preclean",
    status: "complete",
    label: "Pre-clean complete"
  },
  qualify: {
    activeStep: "qualify",
    status: "running",
    label: "Reviewing companies for sales intent"
  },
  qualify_done: {
    activeStep: "qualify",
    status: "complete",
    label: "Qualification complete"
  },
  snapshot: {
    activeStep: "snapshot",
    status: "live",
    label: "Live pipeline data loaded"
  }
};

const state = statusMap[mode] || statusMap.snapshot;

const payload = {
  ok: true,
  runId: run?.runId || null,
  runStartedAt: run?.startedAt || null,
  updatedAt: new Date().toISOString(),
  mode,
  ...state,
  cards: {
    raw: raw.length,
    sources: sourceCount(raw),
    companies: uniqueCount(raw) || raw.length,
    noise: rejected.length,
    accepted: preclean.length,
    rejected: rejected.length,
    ready: uniqueCount(preclean),
    reviewed: reviewed.length,
    queue: leads.length
  },
  sourceStats: {
    raw: raw.length,
    sources: sourceCount(raw),
    companies: uniqueCount(raw) || raw.length
  },
  precleanStats: {
    accepted: preclean.length,
    rejected: rejected.length,
    ready: uniqueCount(preclean)
  },
  qualificationStats: {
    reviewed: reviewed.length,
    queue: leads.length,
    reviewedVisible: leads.filter((lead) => lead.reviewStatus === "reviewed").length,
    pendingVisible: leads.filter((lead) => lead.reviewStatus === "pending").length
  },
  sampleLeads: leads.slice(0, 5).map((lead) => ({
    companyName: lead.companyName,
    runId: lead.runId,
    reviewStatus: lead.reviewStatus,
    intentScore: lead.intentScore
  }))
};

await writeFile(
  path.join(DATA_DIR, "pipeline-status.json"),
  JSON.stringify(payload, null, 2)
);

console.log(`Pipeline status updated locally: ${mode}`);
console.log(JSON.stringify(payload.cards, null, 2));
