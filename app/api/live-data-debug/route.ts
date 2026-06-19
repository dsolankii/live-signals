import { readFile } from "fs/promises";
import { pullPipelineDataFromBlob } from "@/lib/run-local-script";
import { getPipelineDataPath } from "@/lib/pipeline-data-dir";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function readJson(fileName: string, fallback: any) {
  try {
    return JSON.parse(await readFile(getPipelineDataPath(fileName), "utf8"));
  } catch {
    return fallback;
  }
}

export async function GET() {
  if (process.env.VERCEL) {
    await pullPipelineDataFromBlob();
  }

  const run = await readJson("current-live-run.json", null);
  const raw = await readJson("real-source-mentions.json", []);
  const preclean = await readJson("real-source-mentions-preclean.json", []);
  const reviewed = await readJson("ai-enriched-company-leads.json", []);
  const leads = await readJson("company-dashboard-leads.json", []);

  return Response.json(
    {
      ok: true,
      checkedAt: new Date().toISOString(),
      run,
      counts: {
        raw: raw.length,
        accepted: preclean.length,
        reviewed: reviewed.length,
        leads: leads.length
      },
      firstLead: leads[0] || null,
      sampleLeadNames: leads.slice(0, 10).map((lead: any) => ({
        companyName: lead.companyName,
        runId: lead.runId,
        reviewStatus: lead.reviewStatus,
        intentScore: lead.intentScore
      }))
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
      }
    }
  );
}
