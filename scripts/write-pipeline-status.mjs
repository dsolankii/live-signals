import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";
import { DATA_DIR } from "./data-dir.mjs";

const mode = process.argv[2] || "snapshot";

const blobPrefix = process.env.LEADGRID_BLOB_PREFIX || "leadgrid/data";
const isVercel = Boolean(process.env.VERCEL);

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8"));
  } catch {
    return fallback;
  }
}

function uniqueCount(rows, key = "companyName") {
  return new Set(
    rows
      .map((row) => String(row?.[key] || "").trim().toLowerCase())
      .filter(Boolean)
  ).size;
}

await mkdir(DATA_DIR, { recursive: true });

const run = await readJson("current-live-run.json", null);
const raw = await readJson("real-source-mentions.json", []);
const preclean = await readJson("real-source-mentions-preclean.json", []);
const rejected = await readJson("real-source-mentions-rejected-preclean.json", []);
const reviewed = await readJson("ai-enriched-company-leads.json", []);
const leads = await readJson("company-dashboard-leads.json", []);

const sourceStats = {
  raw: raw.length,
  sources: uniqueCount(raw, "sourceName") || uniqueCount(raw, "source") || 0,
  companies: uniqueCount(raw)
};

const precleanStats = {
  accepted: preclean.length,
  rejected: rejected.length,
  ready: uniqueCount(preclean)
};

const qualificationStats = {
  reviewed: reviewed.length,
  queue: leads.length,
  reviewedVisible: leads.filter((lead) => lead.reviewStatus === "reviewed").length,
  pendingVisible: leads.filter((lead) => lead.reviewStatus === "pending").length
};

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
    status: "idle",
    label: "Live snapshot"
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
    raw: sourceStats.raw,
    sources: sourceStats.sources,
    companies: sourceStats.companies,
    noise: rejected.length,
    accepted: precleanStats.accepted,
    rejected: precleanStats.rejected,
    ready: precleanStats.ready,
    reviewed: qualificationStats.reviewed,
    queue: qualificationStats.queue
  },
  sourceStats,
  precleanStats,
  qualificationStats,
  sampleLeads: leads.slice(0, 5).map((lead) => ({
    companyName: lead.companyName,
    runId: lead.runId,
    reviewStatus: lead.reviewStatus,
    intentScore: lead.intentScore
  }))
};

const filePath = path.join(DATA_DIR, "pipeline-status.json");
await writeFile(filePath, JSON.stringify(payload, null, 2));

if (isVercel && process.env.BLOB_READ_WRITE_TOKEN) {
  await put(`${blobPrefix}/pipeline-status.json`, JSON.stringify(payload, null, 2), {
    access: "private",
    allowOverwrite: true
  });
}

console.log(`Pipeline status updated: ${mode}`);
console.log(JSON.stringify(payload.cards, null, 2));
