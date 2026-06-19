import fs from "fs";

const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const packages = lock.packages || {};

const roots = [
  "dotenv",
  "@google/genai",
  "@vercel/blob",
  "jsonrepair"
];

function packagePath(name) {
  return `node_modules/${name}`;
}

function packageJsonPath(name) {
  return `${packagePath(name)}/package.json`;
}

function readDeps(name) {
  const pkg = packages[packagePath(name)];
  return {
    ...(pkg?.dependencies || {}),
    ...(pkg?.optionalDependencies || {}),
    ...(pkg?.peerDependencies || {})
  };
}

const seen = new Set();

function addPackage(name) {
  if (seen.has(name)) return;
  if (!packages[packagePath(name)]) return;

  seen.add(name);

  const deps = readDeps(name);
  for (const depName of Object.keys(deps)) {
    addPackage(depName);
  }
}

for (const root of roots) {
  addPackage(root);
}

const nodeIncludes = [...seen]
  .sort()
  .map((name) => `  "./node_modules/${name}/**/*"`);

const baseIncludes = [
  '  "./scripts/**/*"',
  '  "./data/**/*"',
  '  "./package.json"'
];

const includes = [...baseIncludes, ...nodeIncludes].join(",\n");

const routeKeys = [
  "/api/run-pipeline-step",
  "/api/leads",
  "/api/leads-csv",
  "/api/reveal-leads-next",
  "/api/run-signal-scan",
  "/api/enrich-next-batch",
  "/api/prefetch-next-batch",
  "/api/enrichment-status"
];

const routeConfig = routeKeys
  .map((route) => `    "${route}": pipelineRuntimeFiles`)
  .join(",\n");

const nextConfig = `import type { NextConfig } from "next";

const pipelineRuntimeFiles = [
${includes}
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
${routeConfig}
  }
};

export default nextConfig;
`;

fs.writeFileSync("next.config.ts", nextConfig);

console.log("Runtime packages included:");
console.log([...seen].sort().join("\\n"));
console.log("\\nTotal runtime packages:", seen.size);
