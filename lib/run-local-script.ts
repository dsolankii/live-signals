import { access } from "fs/promises";
import { constants } from "fs";
import { spawn } from "child_process";
import path from "path";

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

export async function scriptExists(scriptPath: string) {
  try {
    await access(path.join(process.cwd(), scriptPath), constants.F_OK);
    return true;
  } catch {
    return false;
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
  const isBlobScript =
    scriptPath.includes("blob-pull") ||
    scriptPath.includes("blob-push") ||
    scriptPath.includes("blob-sync");

  if (!isVercel || isBlobScript) {
    return runNodeScript(scriptPath, timeoutMs);
  }

  const pullResult = await runNodeScript("scripts/blob-pull.mjs", 60 * 1000);

  if (!pullResult.ok) {
    return {
      ok: false,
      code: pullResult.code,
      stdout: pullResult.stdout,
      stderr: `Blob pull failed before running ${scriptPath}\n${pullResult.stderr}`.trim()
    };
  }

  const scriptResult = await runNodeScript(scriptPath, timeoutMs);

  if (!scriptResult.ok) {
    return scriptResult;
  }

  const pushResult = await runNodeScript("scripts/blob-push.mjs", 60 * 1000);

  if (!pushResult.ok) {
    return {
      ok: false,
      code: pushResult.code,
      stdout: `${scriptResult.stdout}\n\n[BLOB PUSH STDOUT]\n${pushResult.stdout}`.trim(),
      stderr: `${scriptResult.stderr}\n\nBlob push failed after running ${scriptPath}\n${pushResult.stderr}`.trim()
    };
  }

  return {
    ok: true,
    code: scriptResult.code,
    stdout: `${scriptResult.stdout}\n\n[BLOB PUSH STDOUT]\n${pushResult.stdout}`.trim(),
    stderr: scriptResult.stderr
  };
}
