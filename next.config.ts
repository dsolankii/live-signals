import type { NextConfig } from "next";

const pipelineRuntimeFiles = [
  "./scripts/**/*",
  "./data/**/*",
  "./package.json",

  "./node_modules/dotenv/**/*",

  "./node_modules/@vercel/blob/**/*",
  "./node_modules/is-node-process/**/*",

  "./node_modules/@google/genai/**/*"
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
