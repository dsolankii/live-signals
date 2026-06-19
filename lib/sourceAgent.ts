import rawData from "@/data/raw-company-mentions.json";
import { RawCompanyMention, SourceType } from "@/types/company";

export type SourceAgentConfig = {
  id: string;
  name: string;
  sourceType: SourceType;
  url: string;
  strategy: string;
  whyUseful: string;
};

export type AgentExtractionRun = {
  sourceId: string;
  sourceName: string;
  status: "completed" | "failed";
  extractedCount: number;
  notes: string;
  rawMentions: RawCompanyMention[];
};

export const sourceConfigs: SourceAgentConfig[] = [
  {
    id: "conference",
    name: "SaaS/GTM Conference Sources",
    sourceType: "conference",
    url: "https://example-saas-conf.com/exhibitors",
    strategy: "Extract exhibitor companies, websites, descriptions, and source URLs.",
    whyUseful: "Conference exhibitors are high-context companies already investing in growth, visibility, and GTM.",
  },
  {
    id: "accelerator",
    name: "Startup Accelerator Batch Sources",
    sourceType: "accelerator",
    url: "https://example-accelerator.com/batch",
    strategy: "Extract startup names, websites, batch pages, and descriptions.",
    whyUseful: "Accelerator companies are early-stage, growth-focused, and likely to need pipeline support.",
  },
  {
    id: "funding_news",
    name: "Funding / Growth News Sources",
    sourceType: "funding_news",
    url: "https://example-news.com/startup-funding",
    strategy: "Extract funded companies, descriptions, websites, and article URLs.",
    whyUseful: "Recently funded companies are often under pressure to grow revenue and build sales pipeline.",
  },
  {
    id: "startup_directory",
    name: "Startup Directory Sources",
    sourceType: "startup_directory",
    url: "https://example-startups.com/saas",
    strategy: "Extract company names, websites, categories, and short descriptions.",
    whyUseful: "Directories provide broad top-of-funnel coverage but require dedupe and qualification.",
  },
  {
    id: "careers_page",
    name: "Career / Job Sources",
    sourceType: "careers_page",
    url: "https://example-careers.com/jobs",
    strategy: "Extract companies hiring sales, GTM, and revenue roles.",
    whyUseful: "Sales hiring is a strong signal that a company may need outbound or appointment-setting support.",
  },
];

export function runSourceExtractionAgent(): {
  sourceConfigs: SourceAgentConfig[];
  extractionRuns: AgentExtractionRun[];
} {
  const rawMentions = rawData as RawCompanyMention[];

  const extractionRuns = sourceConfigs.map((source) => {
    const mentionsForSource = rawMentions.filter(
      (mention) => mention.sourceType === source.sourceType
    );

    return {
      sourceId: source.id,
      sourceName: source.name,
      status: "completed" as const,
      extractedCount: mentionsForSource.length,
      notes: `Agent extracted ${mentionsForSource.length} raw company mentions from ${source.name}.`,
      rawMentions: mentionsForSource,
    };
  });

  return {
    sourceConfigs,
    extractionRuns,
  };
}
