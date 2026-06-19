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

  const status = await readJson("pipeline-status.json", {
    ok: true,
    activeStep: "idle",
    status: "idle",
    label: "No live run yet",
    updatedAt: new Date().toISOString(),
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
    }
  });

  return Response.json(status, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0"
    }
  });
}
