import { spawnSync } from "child_process";

const scripts = [
  "scripts/enrich-company-batch-ai.mjs",
  "scripts/build-company-dashboard-dataset.mjs"
];

for (const script of scripts) {
  console.log(`\nRunning ${script}`);

  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    console.error(`${script} failed with code ${result.status}`);
    process.exit(result.status || 1);
  }
}

console.log("\nQualification complete");
