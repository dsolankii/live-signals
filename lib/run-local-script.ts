import { access, mkdir, readFile, writeFile } from "fs/promises";
import { constants } from "fs";
import { spawn } from "child_process";
import path from "path";
import { get, put } from "@vercel/blob";

export type RunLocalScriptResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
};

const isVercel = Boolean(process.env.VERCEL);

const runtimeDataDir = isVercel
  ? "/tmp/leadgrid-data"
  : path.join(process.cwd(), "data");

const blobPrefix = process.env.LEADGRID_BLOB_PREFIX || "leadgrid/data";

const blobFiles = [
  "current-live-run.json",
  "real-source-mentions.json",
  "real-source-mentions.csv",
  "real-source-mentions-preclean.json",
  "real-source-mentions-rejected-preclean.json",
  "ai-enriched-company-leads.json",
  "ai-enriched-company-leads.csv",
  "company-dashboard-leads.json",
  "company-dashboard-leads.csv",
  "raw-company-mentions.json",
  "leadgrid-visible-state.json",
  "saas-conference-source-pages.json",
  "open-lead-rss-sources.json"
];

export async function scriptExists(scriptPath: string) {
  try {
    await access(path.join(process.cwd(), scriptPath), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(filePath: string) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readPrivateBlobText(pathname: string) {
  try {
    const result = await get(pathname, {
      access: "private"
    });

    if (!result?.stream) {
      return null;
    }

    const reader = result.stream.getReader();
    const chunks: Buffer[] = [];

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;
      if (value) chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks).toString("utf8");
  } catch (error: any) {
    const message = String(error?.message || error);

    if (
      error?.status === 404 ||
      error?.statusCode === 404 ||
      message.includes("404") ||
      message.toLowerCase().includes("not found")
    ) {
      return null;
    }

    throw error;
  }
}

async function pullBlobData() {
  if (!isVercel) return;

  await mkdir(runtimeDataDir, { recursive: true });

  for (const file of blobFiles) {
    const pathname = `${blobPrefix}/${file}`;
    const text = await readPrivateBlobText(pathname);

    if (text === null) continue;

    await writeFile(path.join(runtimeDataDir, file), text);
  }
}

async function pushBlobData() {
  if (!isVercel) return;

  await mkdir(runtimeDataDir, { recursive: true });

  for (const file of blobFiles) {
    const filePath = path.join(runtimeDataDir, file);
    if (!(await fileExists(filePath))) continue;

    const body = await readFile(filePath);

    await put(`${blobPrefix}/${file}`, body, {
      access: "private",
      allowOverwrite: true
    });
  }
}

function runNodeScript(
  scriptPath: string,
  timeoutMs = 20 * 60 * 1000
): Promise<RunLocalScriptResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LEADGRID_DATA_DIR: runtimeDataDir
      }
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}\nTimed out after ${timeoutMs}ms`.trim()
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr
      });
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim()
      });
    });
  });
}

export async function runLocalScript(
  scriptPath: string,
  timeoutMs = 20 * 60 * 1000
): Promise<RunLocalScriptResult> {
  try {
    if (isVercel) {
      await pullBlobData();
    }

    const result = await runNodeScript(scriptPath, timeoutMs);

    if (!result.ok) {
      return result;
    }

    if (isVercel) {
      await pushBlobData();
    }

    return result;
  } catch (error: any) {
    return {
      ok: false,
      code: null,
      stdout: "",
      stderr: error?.stack || error?.message || String(error)
    };
  }
}
