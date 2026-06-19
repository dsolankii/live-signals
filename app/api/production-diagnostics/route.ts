import { access, mkdir, writeFile, readFile } from "fs/promises";
import { constants } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = {
  name: string;
  ok: boolean;
  detail?: any;
  error?: string;
};

async function check(name: string, fn: () => Promise<any>): Promise<Check> {
  try {
    const detail = await fn();
    return { name, ok: true, detail };
  } catch (error: any) {
    return {
      name,
      ok: false,
      error: error?.stack || error?.message || String(error)
    };
  }
}

async function fileExists(filePath: string) {
  await access(filePath, constants.F_OK);
  return true;
}

export async function GET() {
  const runtimeDataDir =
    process.env.LEADGRID_DATA_DIR ||
    (process.env.VERCEL ? "/tmp/leadgrid-data" : path.join(process.cwd(), "data"));

  const requiredEnv = [
    "AI_PROVIDER",
    "AI_API_KEY",
    "AI_MODEL",
    "ADZUNA_APP_ID",
    "ADZUNA_APP_KEY",
    "LEADGRID_DATA_DIR",
    "LEADGRID_BLOB_PREFIX",
    "BLOB_READ_WRITE_TOKEN"
  ];

  const activeScripts = [
    "scripts/reset-live-run.mjs",
    "scripts/collect-sources.mjs",
    "scripts/collect-extra-sources.mjs",
    "scripts/collect-open-rss-sources.mjs",
    "scripts/collect-saas-conference-pages.mjs",
    "scripts/clean-source-mentions.mjs",
    "scripts/preclean-real-sources.mjs",
    "scripts/enrich-company-batch-ai.mjs",
    "scripts/build-company-dashboard-dataset.mjs"
  ];

  const checks: Check[] = [];

  checks.push(
    await check("runtime env", async () => ({
      VERCEL: process.env.VERCEL || null,
      NODE_ENV: process.env.NODE_ENV || null,
      cwd: process.cwd(),
      runtimeDataDir
    }))
  );

  checks.push(
    await check("required environment variables", async () => {
      const result: Record<string, string> = {};
      for (const key of requiredEnv) {
        result[key] = process.env[key] ? "set" : "missing";
      }

      const missing = Object.entries(result)
        .filter(([, value]) => value === "missing")
        .map(([key]) => key);

      if (missing.length) {
        throw new Error(`Missing env vars: ${missing.join(", ")}`);
      }

      return result;
    })
  );

  checks.push(
    await check("/tmp runtime data directory write", async () => {
      await mkdir(runtimeDataDir, { recursive: true });
      const testFile = path.join(runtimeDataDir, "diagnostics-write-test.txt");
      await writeFile(testFile, `ok ${new Date().toISOString()}`);
      const value = await readFile(testFile, "utf8");
      return { testFile, value };
    })
  );

  checks.push(
    await check("active pipeline scripts exist", async () => {
      const result: Record<string, string> = {};
      for (const script of activeScripts) {
        await fileExists(path.join(process.cwd(), script));
        result[script] = "found";
      }
      return result;
    })
  );

  checks.push(
    await check("dotenv import", async () => {
      await import("dotenv");
      return "import ok";
    })
  );

  checks.push(
    await check("@google/genai import", async () => {
      await import("@google/genai");
      return "import ok";
    })
  );

  checks.push(
    await check("@vercel/blob import", async () => {
      await import("@vercel/blob");
      return "import ok";
    })
  );

  checks.push(
    await check("@vercel/blob auth + write + list", async () => {
      const { put, list, get } = await import("@vercel/blob");

      const prefix = process.env.LEADGRID_BLOB_PREFIX || "leadgrid/data";
      const pathname = `${prefix}/diagnostics.json`;

      await put(
        pathname,
        JSON.stringify({ ok: true, at: new Date().toISOString() }, null, 2),
        {
          access: "private",
          allowOverwrite: true
        }
      );

      const listed = await list({ prefix: `${prefix}/` });
      const diagnosticsBlob = listed.blobs.find((blob) => blob.pathname === pathname);

      if (!diagnosticsBlob) {
        throw new Error("Diagnostics blob was written but not found in list output");
      }

      const result = await get(pathname, {
        access: "private"
      });

      if (!result?.stream) {
        throw new Error("Private blob read failed: no stream returned");
      }

      const reader = result.stream.getReader();
      const chunks: Buffer[] = [];

      while (true) {
        const { value, done } = await reader.read();

        if (done) break;
        if (value) chunks.push(Buffer.from(value));
      }

      const body = Buffer.concat(chunks).toString("utf8");

      return {
        wrote: pathname,
        readBackOk: body.includes("\"ok\": true"),
        blobCount: listed.blobs.length,
        sample: listed.blobs.slice(0, 5).map((blob) => blob.pathname)
      };
    })
  );

  checks.push(
    await check("no old blob-sync stack should be needed", async () => {
      const runLocalScriptPath = path.join(process.cwd(), "lib/run-local-script.ts");
      const source = await readFile(runLocalScriptPath, "utf8");

      return {
        containsBlobSyncScript:
          source.includes("blob-pull.mjs") ||
          source.includes("blob-push.mjs") ||
          source.includes("blob-sync.mjs"),
        note:
          "This should be false after moving Blob persistence into API runtime."
      };
    })
  );

  const ok = checks.every((item) => item.ok);

  return Response.json(
    {
      ok,
      checkedAt: new Date().toISOString(),
      checks
    },
    {
      status: ok ? 200 : 500,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
