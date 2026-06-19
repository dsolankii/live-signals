import { readFile } from "fs/promises";
import { pullPipelineDataFromBlob } from "@/lib/run-local-script";
import { getPipelineDataPath } from "@/lib/pipeline-data-dir";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function readJson<T>(fileName: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(getPipelineDataPath(fileName), "utf8")) as T;
  } catch {
    return fallback;
  }
}

function companyNameOf(row: any) {
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

function uniqueCompanies(rows: any[]) {
  return new Set(
    rows.map((row) => companyNameOf(row).toLowerCase()).filter(Boolean)
  ).size;
}

function sourceCount(rows: any[]) {
  return new Set(
    rows
      .map((row) => row?.sourceName || row?.source || row?.sourceType || row?.url)
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  ).size;
}

export async function GET() {
  if (process.env.VERCEL) {
    await pullPipelineDataFromBlob();
  }

  const run = await readJson<any>("current-live-run.json", null);
  const raw = await readJson<any[]>("real-source-mentions.json", []);
  const accepted = await readJson<any[]>("real-source-mentions-preclean.json", []);
  const rejected = await readJson<any[]>("real-source-mentions-rejected-preclean.json", []);
  const reviewed = await readJson<any[]>("ai-enriched-company-leads.json", []);
  const leads = await readJson<any[]>("company-dashboard-leads.json", []);

  const cards = {
    raw: raw.length,
    sources: sourceCount(raw),
    companies: uniqueCompanies(raw) || raw.length,
    noise: rejected.length,
    accepted: accepted.length,
    rejected: rejected.length,
    ready: uniqueCompanies(accepted),
    reviewed: reviewed.length,
    queue: leads.length
  };

  let activeStep = "idle";
  let status = "idle";
  let label = "No fresh run yet";

  if (cards.queue > 0 || cards.reviewed > 0) {
    activeStep = "qualify";
    status = "complete";
    label = "Qualification complete";
  } else if (cards.accepted > 0 || cards.ready > 0 || cards.rejected > 0) {
    activeStep = "preclean";
    status = "complete";
    label = "Pre-clean complete";
  } else if (cards.raw > 0 || cards.companies > 0) {
    activeStep = "signal_scan";
    status = "complete";
    label = "Signal scan complete";
  }

  return Response.json(
    {
      ok: true,
      runId: run?.runId || null,
      runStartedAt: run?.startedAt || null,
      updatedAt: new Date().toISOString(),
      activeStep,
      status,
      label,
      cards,
      sampleLeads: leads.slice(0, 5).map((lead) => ({
        companyName: lead.companyName,
        runId: lead.runId,
        reviewStatus: lead.reviewStatus,
        intentScore: lead.intentScore
      }))
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0"
      }
    }
  );
}
