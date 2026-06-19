import { spawnSync } from "child_process";

function run(script, args = []) {
  console.log(`\nRunning ${script} ${args.join(" ")}`.trim());

  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    console.error(`${script} failed with code ${result.status}`);
    process.exit(result.status || 1);
  }
}

run("scripts/write-pipeline-status.mjs", ["qualify"]);
run("scripts/enrich-company-batch-ai.mjs");
run("scripts/write-pipeline-status.mjs", ["qualify"]);
run("scripts/build-company-dashboard-dataset.mjs");
run("scripts/write-pipeline-status.mjs", ["qualify_done"]);

console.log("\nQualification wrapper complete");
