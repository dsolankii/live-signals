import { readFile } from "fs/promises";
import { pullPipelineDataFromBlob } from "@/lib/run-local-script";
import { getPipelineDataPath } from "@/lib/pipeline-data-dir";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  if (process.env.VERCEL) {
    await pullPipelineDataFromBlob();
  }

  let csv = "companyName\n";

  try {
    csv = await readFile(getPipelineDataPath("company-dashboard-leads.csv"), "utf8");
  } catch {
    // keep fallback
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leadgrid-live-leads-${Date.now()}.csv"`,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0"
    }
  });
}
