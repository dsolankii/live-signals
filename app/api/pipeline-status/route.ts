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

function uniqueCount(rows: any[], key = "companyName") {
  return new Set(
    rows
      .map((row) => String(row?.[key] || "").trim().toLowerCase())
      .filter(Boolean)
  ).size;
}

function sourceCount(rows: any[]) {
  const values = rows
    .map((row) => row?.sourceName || row?.source || row?.sourceType || row?.url)
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  return new Set(values).size;
}

export async function GET() {
  if (process.env.VERCEL) {
    await pullPipelineDataFromBlob();
  }

  const savedStatus = await readJson<any>("pipeline-status.json", null);

  const run = await readJson<any>("current-live-run.json", null);
  const raw = await readJson<any[]>("real-source-mentions.json", []);
  const preclean = await readJson<any[]>("real-source-mentions-preclean.json", []);
  const rejected = await readJson<any[]>("real-source-mentions-rejected-preclean.json", []);
  const reviewed = await readJson<any[]>("ai-enriched-company-leads.json", []);
  const leads = await readJson<any[]>("company-dashboard-leads.json", []);

  const reviewedVisible = leads.filter((lead) => lead.reviewStatus === "reviewed").length;
  const pendingVisible = leads.filter((lead) => lead.reviewStatus === "pending").length;

  const computedCards = {
    raw: raw.length,
    sources: sourceCount(raw),
    companies: uniqueCount(raw) || raw.length,
    noise: rejected.length,
    accepted: preclean.length,
    rejected: rejected.length,
    ready: uniqueCount(preclean),
    reviewed: reviewed.length,
    queue: leads.length
  };

  const hasLiveData =
    computedCards.raw > 0 ||
    computedCards.accepted > 0 ||
    computedCards.reviewed > 0 ||
    computedCards.queue > 0;

  const payload = {
    ok: true,
    runId: run?.runId || savedStatus?.runId || null,
    runStartedAt: run?.startedAt || savedStatus?.runStartedAt || null,
    updatedAt: new Date().toISOString(),
    activeStep: savedStatus?.activeStep || (hasLiveData ? "snapshot" : "idle"),
    status: savedStatus?.status || (hasLiveData ? "live" : "idle"),
    label: savedStatus?.label || (hasLiveData ? "Live pipeline data loaded" : "No live run yet"),
    cards: computedCards,
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
      reviewedVisible,
      pendingVisible
    },
    sampleLeads: leads.slice(0, 5).map((lead) => ({
      companyName: lead.companyName,
      runId: lead.runId,
      reviewStatus: lead.reviewStatus,
      intentScore: lead.intentScore
    }))
  };

  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0"
    }
  });
}
