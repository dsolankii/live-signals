import { readFile } from "fs/promises";
import { pullPipelineDataFromBlob } from "@/lib/run-local-script";
import { getPipelineDataPath } from "@/lib/pipeline-data-dir";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  try {
    const text = await readFile(getPipelineDataPath(fileName), "utf8");
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export async function GET() {
  if (process.env.VERCEL) {
    await pullPipelineDataFromBlob();
  }

  const run = await readJsonFile<any>("current-live-run.json", null);
  const allLeads = await readJsonFile<any[]>("company-dashboard-leads.json", []);
  const leads = run?.runId
    ? allLeads.filter((lead) => !lead.runId || lead.runId === run.runId)
    : allLeads;
  const visibleState = await readJsonFile<any>("leadgrid-visible-state.json", {
    currentPage: 0,
    maxUnlockedPage: 0,
    pageSize: 50
  });

  const pageSize = Number(visibleState.pageSize || 50);
  const currentPage = Number(visibleState.currentPage || 0);
  const maxUnlockedPage = Number(visibleState.maxUnlockedPage || 0);

  const visibleStart = currentPage * pageSize;
  const visibleEnd = visibleStart + pageSize;
  const visibleLeads = leads.slice(visibleStart, visibleEnd);

  const totalAvailable = leads.length;
  const totalPages = Math.max(1, Math.ceil(totalAvailable / pageSize));

  return Response.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      leads: visibleLeads,
      meta: {
        dataVersion: Date.now(),
        totalAvailable,
        totalPages,
        currentPage,
        maxUnlockedPage,
        pageSize,
        visibleStart,
        visibleEnd: Math.min(visibleEnd, totalAvailable),
        visibleLeadCount: visibleLeads.length,
        scoredVisibleLeads: visibleLeads.filter((lead) => Number(lead.intentScore || 0) > 0).length,
        hiddenLeft: Math.max(0, totalAvailable - visibleEnd),
        canGoPrev: currentPage > 0,
        canGoNext: currentPage < maxUnlockedPage,
        canUnlockNext: visibleEnd < totalAvailable,
        nextStart: visibleEnd,
        nextEnd: Math.min(visibleEnd + pageSize, totalAvailable)
      }
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
