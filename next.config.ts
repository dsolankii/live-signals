import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/run-pipeline-step": [
      "./scripts/**/*",
      "./data/**/*",
      "./package.json"
    ],
    "/api/leads": [
      "./scripts/**/*",
      "./data/**/*"
    ],
    "/api/leads-csv": [
      "./scripts/**/*",
      "./data/**/*"
    ],
    "/api/reveal-leads-next": [
      "./scripts/**/*",
      "./data/**/*"
    ],
    "/api/run-signal-scan": [
      "./scripts/**/*",
      "./data/**/*"
    ],
    "/api/enrich-next-batch": [
      "./scripts/**/*",
      "./data/**/*"
    ],
    "/api/prefetch-next-batch": [
      "./scripts/**/*",
      "./data/**/*"
    ],
    "/api/enrichment-status": [
      "./scripts/**/*",
      "./data/**/*"
    ]
  }
};

export default nextConfig;
