"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Cards = {
  raw: number;
  sources: number;
  companies: number;
  noise: number;
  accepted: number;
  rejected: number;
  ready: number;
  reviewed: number;
  queue: number;
};

const emptyCards: Cards = {
  raw: 0,
  sources: 0,
  companies: 0,
  noise: 0,
  accepted: 0,
  rejected: 0,
  ready: 0,
  reviewed: 0,
  queue: 0
};

function asNumber(value: any) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function cardsFromResponse(result: any, previous: Cards): Cards {
  const sourceStats = result?.sourceStats || {};
  const precleanStats = result?.precleanStats || {};
  const qualificationStats = result?.qualificationStats || {};

  return {
    raw:
      asNumber(result?.rawMentions) ||
      asNumber(sourceStats?.rawMentions) ||
      asNumber(precleanStats?.rawRows) ||
      previous.raw,
    sources:
      asNumber(result?.sourcesScanned) ||
      asNumber(sourceStats?.sourcesScanned) ||
      previous.sources,
    companies:
      asNumber(result?.uniqueCompanies) ||
      asNumber(sourceStats?.uniqueCompanies) ||
      asNumber(precleanStats?.uniqueAcceptedCompanies) ||
      previous.companies,
    noise:
      asNumber(result?.rejectedRows) ||
      asNumber(precleanStats?.rejectedRows) ||
      previous.noise,
    accepted:
      asNumber(result?.acceptedRows) ||
      asNumber(precleanStats?.acceptedRows) ||
      previous.accepted,
    rejected:
      asNumber(result?.rejectedRows) ||
      asNumber(precleanStats?.rejectedRows) ||
      previous.rejected,
    ready:
      asNumber(precleanStats?.uniqueAcceptedCompanies) ||
      previous.ready,
    reviewed:
      asNumber(result?.reviewedCompanies) ||
      asNumber(qualificationStats?.reviewedCompanies) ||
      previous.reviewed,
    queue:
      asNumber(result?.queueCompanies) ||
      asNumber(qualificationStats?.queueCompanies) ||
      previous.queue
  };
}

export default function ConsolePage() {
  const [cards, setCards] = useState<Cards>(emptyCards);
  const [activeStep, setActiveStep] = useState<string>("idle");
  const [label, setLabel] = useState<string>("Ready to run fresh pipeline");
  const [busy, setBusy] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string>("");

  async function loadSnapshot() {
    try {
      const response = await fetch(`/api/pipeline-status?t=${Date.now()}`, {
        cache: "no-store"
      });

      const data = await response.json();

      if (data?.cards) {
        setCards({
          raw: asNumber(data.cards.raw),
          sources: asNumber(data.cards.sources),
          companies: asNumber(data.cards.companies),
          noise: asNumber(data.cards.noise),
          accepted: asNumber(data.cards.accepted),
          rejected: asNumber(data.cards.rejected),
          ready: asNumber(data.cards.ready),
          reviewed: asNumber(data.cards.reviewed),
          queue: asNumber(data.cards.queue)
        });
      }

      if (data?.activeStep) setActiveStep(data.activeStep);
      if (data?.label) setLabel(data.label);
    } catch {
      // keep UI stable
    }
  }

  useEffect(() => {
    loadSnapshot();
  }, []);

  async function runStep(step: "collect_sources" | "preclean" | "qualify") {
    setBusy(step);
    setLastError("");

    const labelByStep: Record<string, string> = {
      collect_sources: "Running fresh extraction...",
      preclean: "Running pre-clean...",
      qualify: "Running qualification and intent scoring..."
    };

    setLabel(labelByStep[step]);
    setActiveStep(step);

    try {
      const response = await fetch(`/api/run-pipeline-step?t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        cache: "no-store",
        body: JSON.stringify({ step })
      });

      const result = await response.json();

      if (!result.ok) {
        setLastError(result.stderr || result.error || "Step failed");
      }

      setCards((previous) => cardsFromResponse(result, previous));

      if (step === "collect_sources") {
        setLabel("Signal scan complete");
        setActiveStep("signal_scan");
      }

      if (step === "preclean") {
        setLabel("Pre-clean complete");
        setActiveStep("preclean");
      }

      if (step === "qualify") {
        setLabel("Qualification complete");
        setActiveStep("qualify");
      }

      await loadSnapshot();
    } catch (error: any) {
      setLastError(error?.message || "Request failed");
    } finally {
      setBusy(null);
    }
  }

  const cardItems = [
    ["Raw", cards.raw],
    ["Sources", cards.sources],
    ["Companies", cards.companies],
    ["Noise", cards.noise],
    ["Accepted", cards.accepted],
    ["Rejected", cards.rejected],
    ["Ready", cards.ready],
    ["Reviewed", cards.reviewed],
    ["Queue", cards.queue]
  ];

  return (
    <main className="min-h-screen bg-[#f6f1e8] px-6 py-8 text-[#2b2118]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-sm uppercase tracking-[0.28em] text-[#8b6b4a]">
              LeadGrid
            </p>
            <h1 className="text-4xl font-semibold tracking-tight">
              Live Signal Console
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-[#6f5b46]">
              Real extraction, real pre-cleaning, real qualification. Counters update after each completed step.
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/leads"
              className="rounded-full bg-[#2b2118] px-5 py-3 text-sm font-medium text-white"
            >
              Reveal Leads
            </Link>
            <button
              onClick={loadSnapshot}
              className="rounded-full border border-[#c8b69e] px-5 py-3 text-sm font-medium"
            >
              Refresh
            </button>
          </div>
        </div>

        <section className="mb-6 rounded-3xl border border-[#dacbb8] bg-white/70 p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-[#8b6b4a]">Current step</p>
              <p className="text-xl font-semibold">{label}</p>
              <p className="text-xs text-[#8b6b4a]">State: {activeStep}</p>
            </div>
            {busy ? (
              <p className="rounded-full bg-[#f2dfc3] px-4 py-2 text-sm">
                Working: {busy}
              </p>
            ) : (
              <p className="rounded-full bg-[#e8f0df] px-4 py-2 text-sm">
                Ready
              </p>
            )}
          </div>

          {lastError ? (
            <pre className="mt-4 max-h-40 overflow-auto rounded-2xl bg-[#3b211b] p-4 text-xs text-white">
              {lastError}
            </pre>
          ) : null}
        </section>

        <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-9">
          {cardItems.map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-3xl border border-[#dacbb8] bg-white p-4 shadow-sm"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-[#8b6b4a]">
                {label}
              </p>
              <p className="mt-2 text-3xl font-semibold">{value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <button
            disabled={Boolean(busy)}
            onClick={() => runStep("collect_sources")}
            className="rounded-3xl bg-[#7b3f2a] p-6 text-left text-white disabled:opacity-60"
          >
            <p className="text-sm opacity-80">Step 1</p>
            <p className="mt-2 text-2xl font-semibold">Start Signal Scan</p>
            <p className="mt-3 text-sm opacity-80">
              Runs fresh extraction from live sources and updates Raw, Sources, and Companies.
            </p>
          </button>

          <button
            disabled={Boolean(busy)}
            onClick={() => runStep("preclean")}
            className="rounded-3xl bg-[#8b6b4a] p-6 text-left text-white disabled:opacity-60"
          >
            <p className="text-sm opacity-80">Step 2</p>
            <p className="mt-2 text-2xl font-semibold">Send to Pre-Cleaning</p>
            <p className="mt-3 text-sm opacity-80">
              Runs real pre-cleaning and updates Accepted, Rejected, and Ready.
            </p>
          </button>

          <button
            disabled={Boolean(busy)}
            onClick={() => runStep("qualify")}
            className="rounded-3xl bg-[#2b2118] p-6 text-left text-white disabled:opacity-60"
          >
            <p className="text-sm opacity-80">Step 3</p>
            <p className="mt-2 text-2xl font-semibold">Qualify Companies</p>
            <p className="mt-3 text-sm opacity-80">
              Runs LLM intent scoring and updates Reviewed and Queue.
            </p>
          </button>
        </section>
      </div>
    </main>
  );
}
