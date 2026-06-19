import type { NextConfig } from "next";

const pipelineRuntimeFiles = [
  "./scripts/**/*",
  "./data/**/*",
  "./package.json",

  // Runtime deps used by child Node scripts on Vercel.
  "./node_modules/dotenv/**/*",
  "./node_modules/@vercel/blob/**/*",
  "./node_modules/is-node-process/**/*",
  "./node_modules/is-buffer/**/*",
  "./node_modules/@google/genai/**/*",

  // Safety net for SDK transitive deps used by spawned scripts.
  "./node_modules/**/*"
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/run-pipeline-step": pipelineRuntimeFiles,
    "/api/leads": pipelineRuntimeFiles,
    "/api/leads-csv": pipelineRuntimeFiles,
    "/api/reveal-leads-next": pipelineRuntimeFiles,
    "/api/run-signal-scan": pipelineRuntimeFiles,
    "/api/enrich-next-batch": pipelineRuntimeFiles,
    "/api/prefetch-next-batch": pipelineRuntimeFiles,
    "/api/enrichment-status": pipelineRuntimeFiles
  }
};

export default nextConfig;
