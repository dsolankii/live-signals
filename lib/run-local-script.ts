import { spawn } from "child_process";
import { access } from "fs/promises";
import path from "path";

export async function scriptExists(scriptPath: string) {
  try {
    await access(path.join(process.cwd(), scriptPath));
    return true;
  } catch {
    return false;
  }
}

export async function runLocalScript(scriptPath: string, timeoutMs = 20 * 60 * 1000) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${scriptPath} timed out`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `${scriptPath} failed with code ${code}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`
          )
        );
      }
    });
  });
}
