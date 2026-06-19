import { writeFile, mkdir } from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");

await mkdir(DATA_DIR, { recursive: true });

const startedAt = new Date().toISOString();
const runId = `run_${startedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`;

await writeFile(
  path.join(DATA_DIR, "current-live-run.json"),
  JSON.stringify(
    {
      runId,
      startedAt
    },
    null,
    2
  )
);

await writeFile(path.join(DATA_DIR, "ai-enriched-company-leads.json"), "[]\n");
await writeFile(path.join(DATA_DIR, "ai-enriched-company-leads.csv"), "companyName\n");

await writeFile(path.join(DATA_DIR, "company-dashboard-leads.json"), "[]\n");
await writeFile(path.join(DATA_DIR, "company-dashboard-leads.csv"), "companyName\n");

await writeFile(path.join(DATA_DIR, "raw-company-mentions.json"), "[]\n");

await writeFile(
  path.join(DATA_DIR, "leadgrid-visible-state.json"),
  JSON.stringify(
    {
      currentPage: 0,
      maxUnlockedPage: 0,
      pageSize: 50
    },
    null,
    2
  )
);

console.log("Fresh run started");
console.log(`Run ID: ${runId}`);
console.log("Old reviewed queue cleared");
