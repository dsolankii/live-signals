export const maxDuration = 300;
import { mkdir, readFile, access, copyFile } from "fs/promises";
import path from "path";
import { runLocalScript } from "@/lib/run-local-script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEADGRID_DATA_DIR =
  process.env.LEADGRID_DATA_DIR ||
  (process.env.VERCEL ? "/tmp/leadgrid-data" : path.join(process.cwd(), "data"));

type PipelineStep =
  | "collect_sources"
  | "collect_extra"
  | "collect_saas"
  | "preclean"
  | "qualify";

const stepScripts: Record<PipelineStep, string[]> = {
  // One UI "Extract" click should collect every source bucket.
  collect_sources: [
    "scripts/reset-live-run.mjs",
    "scripts/collect-sources.mjs",
    "scripts/collect-extra-sources.mjs",
    "scripts/collect-open-rss-sources.mjs",
    "scripts/collect-saas-conference-pages.mjs"
  ],

  // Kept for compatibility/manual testing.
  collect_extra: [
    "scripts/collect-extra-sources.mjs",
    "scripts/collect-open-rss-sources.mjs"
  ],
  collect_saas: ["scripts/collect-saas-conference-pages.mjs"],

  preclean: [
    "scripts/clean-source-mentions.mjs",
    "scripts/preclean-real-sources.mjs"
  ],
  qualify: ["scripts/qualify-company-queue.mjs"]
};

function dataFile(name: string) {
  return path.join(LEADGRID_DATA_DIR, name);
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureRuntimeSeedData() {
  await mkdir(LEADGRID_DATA_DIR, { recursive: true });

  const seedFiles = [
    "saas-conference-source-pages.json",
    "open-lead-rss-sources.json"
  ];

  for (const file of seedFiles) {
    const runtimePath = dataFile(file);
    const repoPath = path.join(process.cwd(), "data", file);

    if (!(await fileExists(runtimePath)) && (await fileExists(repoPath))) {
      await copyFile(repoPath, runtimePath);
    }
  }
}

async function readJsonArray(name: string) {
  try {
    const raw = await readFile(dataFile(name), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cleanCompanyValue(value: any) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function companyName(row: any) {
  const direct =
    row?.companyName ||
    row?.company_name ||
    row?.company ||
    row?.name ||
    row?.organization ||
    row?.organisation ||
    row?.employer ||
    row?.employerName ||
    row?.employer_name ||
    row?.hiringCompany ||
    row?.hiring_company ||
    row?.accountName ||
    row?.account_name ||
    row?.brandName ||
    row?.brand_name ||
    row?.partnerName ||
    row?.partner_name ||
    row?.sponsorName ||
    row?.sponsor_name;

  const cleanedDirect = cleanCompanyValue(direct);
  if (cleanedDirect) return cleanedDirect;

  const seen = new Set<any>();

  function walk(value: any): string {
    if (!value || typeof value !== "object" || seen.has(value)) return "";
    seen.add(value);

    for (const [key, child] of Object.entries(value)) {
      const keyLooksLikeCompany =
        /company|employer|organization|organisation|account|brand|partner|sponsor/i.test(key);

      if (keyLooksLikeCompany && typeof child === "string") {
        const cleaned = cleanCompanyValue(child);
        if (cleaned) return cleaned;
      }

      if (keyLooksLikeCompany && child && typeof child === "object") {
        const nestedName =
          cleanCompanyValue((child as any).name) ||
          cleanCompanyValue((child as any).title) ||
          cleanCompanyValue((child as any).companyName);
        if (nestedName) return nestedName;
      }
    }

    for (const child of Object.values(value)) {
      const nested = walk(child);
      if (nested) return nested;
    }

    return "";
  }

  return walk(row);
}

function sourceName(row: any) {
  return String(row?.sourceName || row?.source || row?.sourceType || "").trim();
}

function uniqueCount(rows: any[], getter: (row: any) => string) {
  return new Set(rows.map(getter).filter(Boolean).map((value) => value.toLowerCase())).size;
}

function scoreValue(row: any) {
  const raw =
    row?.score ??
    row?.aiIntentScore ??
    row?.intentScore ??
    row?.leadScore ??
    row?.fitScore ??
    0;

  const value =
    typeof raw === "string" ? Number(raw.replace("%", "").trim()) : Number(raw);

  return Number.isFinite(value) ? value : 0;
}

async function getSourceStats() {
  const rawRows = await readJsonArray("real-source-mentions.json");
  const uniqueCompanies = uniqueCount(rawRows, companyName);

  return {
    rawMentions: rawRows.length,

    // Extraction stage is raw-signal based. Some source rows do not expose a
    // normalized companyName until pre-cleaning, so never show 0 here when
    // raw extraction succeeded.
    uniqueCompanies: uniqueCompanies || rawRows.length,

    sourcesScanned: uniqueCount(rawRows, sourceName)
  };
}

async function getPrecleanStats() {
  const rawRows = await readJsonArray("real-source-mentions.json");
  const acceptedRows = await readJsonArray("real-source-mentions-preclean.json");
  const rejectedRows = await readJsonArray("real-source-mentions-rejected-preclean.json");

  return {
    rawRows: rawRows.length,
    acceptedRows: acceptedRows.length,
    rejectedRows: rejectedRows.length,
    uniqueAcceptedCompanies: uniqueCount(acceptedRows, companyName)
  };
}

async function getQualificationStats() {
  const reviewedRows = await readJsonArray("ai-enriched-company-leads.json");
  const queueRows = await readJsonArray("company-dashboard-leads.json");

  return {
    reviewedCompanies: reviewedRows.length,
    queueCompanies: queueRows.length,
    reviewedVisible: queueRows.filter((row: any) => row.reviewStatus === "reviewed").length,
    pendingVisible: queueRows.filter((row: any) => row.reviewStatus === "pending").length,
    scoredQueueCompanies: queueRows.filter((row: any) => scoreValue(row) > 0).length
  };
}

function labelForScript(script: string) {
  if (script.includes("reset-live-run")) return "Fresh run";
  if (script.includes("collect-sources")) return "Jobs";
  if (script.includes("collect-extra")) return "Web";
  if (script.includes("collect-open-rss")) return "RSS";
  if (script.includes("collect-saas")) return "Events";
  if (script.includes("clean-source")) return "Clean";
  if (script.includes("preclean")) return "Pre-clean";
  if (script.includes("enrich-company")) return "Review";
  if (script.includes("build-company")) return "Queue";
  return "Step";
}

function parseUserLogs(stdout: string, script: string) {
  const label = labelForScript(script);
  const lines = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  const logs: string[] = [];

  for (const line of lines) {
    let match =
      line.match(/^(.+?) extracted:\s*(\d+)/i) ||
      line.match(/^(.+?) extracted\s*(\d+)/i);

    if (match) {
      logs.push(`${match[1].trim()} ${match[2]}`);
      continue;
    }

    match = line.match(/^Final total rows:\s*(\d+)/i);
    if (match) {
      logs.push(`Total ${match[1]}`);
      continue;
    }

    match = line.match(/^Merged rows:\s*(\d+)/i);
    if (match) {
      logs.push(`Merged ${match[1]}`);
      continue;
    }

    match = line.match(/^Raw rows:\s*(\d+)/i);
    if (match) {
      logs.push(`Read ${match[1]}`);
      continue;
    }

    match = line.match(/^Accepted for .*?:\s*(\d+)/i);
    if (match) {
      logs.push(`Accepted ${match[1]}`);
      continue;
    }

    match = line.match(/^Hard rejected.*?:\s*(\d+)/i);
    if (match) {
      logs.push(`Rejected ${match[1]}`);
      continue;
    }

    match = line.match(/^New companies enriched:\s*(\d+)/i);
    if (match) {
      logs.push(`Reviewed ${match[1]}`);
      continue;
    }

    match = line.match(/^Final lead queue rows:\s*(\d+)/i);
    if (match) {
      logs.push(`Queue ${match[1]}`);
      continue;
    }

    match = line.match(/^Final dashboard company rows:\s*(\d+)/i);
    if (match) {
      logs.push(`Queue ${match[1]}`);
      continue;
    }

    match = line.match(/^Run ID:\s*(.+)$/i);
    if (match) {
      logs.push(`Run ${match[1]}`);
      continue;
    }
  }

  if (!logs.length) {
    logs.push(`${label} complete`);
  }

  return logs;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const step = body?.step as PipelineStep;

    if (!step || !stepScripts[step]) {
      return Response.json(
        {
          ok: false,
          error: "Unknown pipeline step",
          allowedSteps: Object.keys(stepScripts)
        },
        { status: 400 }
      );
    }

    await ensureRuntimeSeedData();

    const logs: string[] = [];
    const scriptResults: any[] = [];

    for (const script of stepScripts[step]) {
      const result = await runLocalScript(script, 20 * 60 * 1000);

      scriptResults.push({
        script,
        ok: result.ok,
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr
      });

      logs.push(...parseUserLogs(result.stdout, script));

      if (!result.ok) {
        return Response.json(
          {
            ok: false,
            step,
            runAt: new Date().toISOString(),
            error: `${labelForScript(script)} failed`,
            stderr: result.stderr,
            stdout: result.stdout,
            logs,
            sourceStats: await getSourceStats(),
            precleanStats: await getPrecleanStats(),
            qualificationStats: await getQualificationStats(),
            rawMentions: (await getSourceStats()).rawMentions,
            uniqueCompanies: (await getSourceStats()).uniqueCompanies,
            sourcesScanned: (await getSourceStats()).sourcesScanned,
            acceptedRows: (await getPrecleanStats()).acceptedRows,
            rejectedRows: (await getPrecleanStats()).rejectedRows,
            reviewedCompanies: (await getQualificationStats()).reviewedCompanies,
            queueCompanies: (await getQualificationStats()).queueCompanies
          },
          { status: 500 }
        );
      }
    }

    const sourceStats = await getSourceStats();
    const precleanStats = await getPrecleanStats();
    const qualificationStats = await getQualificationStats();

    return Response.json(
      {
        ok: true,
        step,
        runAt: new Date().toISOString(),
        logs,
        scriptResults,

        sourceStats,
        precleanStats,
        qualificationStats,

        // Top-level aliases so /console can never show 0 because of field-name mismatch.
        rawMentions: sourceStats.rawMentions,
        uniqueCompanies: sourceStats.uniqueCompanies,
        sourcesScanned: sourceStats.sourcesScanned,
        acceptedRows: precleanStats.acceptedRows,
        rejectedRows: precleanStats.rejectedRows,
        reviewedCompanies: qualificationStats.reviewedCompanies,
        queueCompanies: qualificationStats.queueCompanies
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
        }
      }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
