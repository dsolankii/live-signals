import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { DATA_DIR } from "./data-dir.mjs";

await mkdir(DATA_DIR, { recursive: true });

const startedAt = new Date().toISOString();
const runId = `run_${startedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`;

async function writeJson(fileName, value) {
  await writeFile(path.join(DATA_DIR, fileName), JSON.stringify(value, null, 2));
}

async function writeText(fileName, value) {
  await writeFile(path.join(DATA_DIR, fileName), value);
}

await writeJson("current-live-run.json", {
  runId,
  startedAt
});

/**
 * Clear every generated output from the previous run.
 * This prevents the UI from mixing new raw counts with old pre-clean / qualify / leads.
 */
await writeJson("real-source-mentions.json", []);
await writeText("real-source-mentions.csv", "companyName\n");

await writeJson("real-source-mentions-preclean.json", []);
await writeJson("real-source-mentions-rejected-preclean.json", []);

await writeJson("ai-enriched-company-leads.json", []);
await writeText("ai-enriched-company-leads.csv", "companyName\n");

await writeJson("company-dashboard-leads.json", []);
await writeText("company-dashboard-leads.csv", "companyName\n");

await writeJson("raw-company-mentions.json", []);

await writeJson("leadgrid-visible-state.json", {
  currentPage: 0,
  maxUnlockedPage: 0,
  pageSize: 50
});

await writeJson("pipeline-status.json", {
  ok: true,
  runId,
  runStartedAt: startedAt,
  updatedAt: startedAt,
  activeStep: "signal_scan",
  status: "running",
  label: "Starting fresh live run",
  cards: {
    raw: 0,
    sources: 0,
    companies: 0,
    noise: 0,
    accepted: 0,
    rejected: 0,
    ready: 0,
    reviewed: 0,
    queue: 0
  },
  sourceStats: {
    raw: 0,
    sources: 0,
    companies: 0
  },
  precleanStats: {
    accepted: 0,
    rejected: 0,
    ready: 0
  },
  qualificationStats: {
    reviewed: 0,
    queue: 0,
    reviewedVisible: 0,
    pendingVisible: 0
  },
  sampleLeads: []
});

console.log("Fresh run started");
console.log(`Run ID: ${runId}`);
console.log("Previous raw, pre-clean, qualification, lead queue, and status files cleared");
