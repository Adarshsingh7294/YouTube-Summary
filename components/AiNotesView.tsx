"use client";

import {
  Sparkles,
  ListChecks,
  BookOpen,
  BarChart3,
  CheckSquare,
  Clock,
  HelpCircle,
  Youtube,
  Calendar,
} from "lucide-react";
import type { SummaryResponse } from "@/lib/types";
import CopyButton from "./CopyButton";
import DownloadPdfButton from "./DownloadPdfButton";

export default function AiNotesView({ summary }: { summary: SummaryResponse }) {
  const markdown = buildMarkdown(summary);

  return (
    <div className="card-surface overflow-hidden animate-fade-up">
      {/* Header */}
      <div className="relative border-b border-[rgb(var(--border))] bg-gradient-to-br from-[rgb(var(--accent))] to-transparent p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted-foreground))]">
              <Sparkles className="h-3 w-3 text-[rgb(var(--primary))]" />
              AI Notes
            </div>
            <a
              href={`https://www.youtube.com/watch?v=${summary.videoId}`}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--primary))] hover:underline"
            >
              <Youtube className="h-3.5 w-3.5" />
              Watch on YouTube
            </a>
            <h1 className="mt-1.5 text-balance text-2xl font-bold tracking-tight sm:text-3xl">
              {summary.title}
            </h1>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <CopyButton text={markdown} label="Copy notes" />
            <DownloadPdfButton summary={summary} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-8 p-5 sm:p-8">
        <Section
          icon={<Sparkles className="h-3.5 w-3.5" />}
          title="Executive Summary"
        >
          {summary.executiveSummary ? (
            <div className="prose-notes">
              {summary.executiveSummary
                .split(/\n{2,}/)
                .map((p, i) => (
                  <p key={i}>{p.trim()}</p>
                ))}
            </div>
          ) : (
            <Empty text="No executive summary was generated." />
          )}
        </Section>

        <Section
          icon={<ListChecks className="h-3.5 w-3.5" />}
          title="Key Takeaways"
        >
          {summary.keyTakeaways.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {summary.keyTakeaways.map((item, i) => (
                <li
                  key={i}
                  className="note-card flex items-start gap-2.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--muted))] p-3 text-sm"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[rgb(var(--primary))] text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="text-pretty leading-relaxed text-[rgb(var(--foreground))]">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="No key takeaways were generated." />
          )}
        </Section>

        <Section
          icon={<BookOpen className="h-3.5 w-3.5" />}
          title="Detailed Breakdown"
        >
          {summary.detailedBreakdown.length > 0 ? (
            <div className="space-y-5">
              {summary.detailedBreakdown.map((section, i) => (
                <article
                  key={i}
                  className="note-card rounded-xl border border-[rgb(var(--border))] p-4 sm:p-5"
                >
                  <h3 className="note-section-title flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-[rgb(var(--accent))] text-xs font-bold text-[rgb(var(--accent-foreground))]">
                      {i + 1}
                    </span>
                    {section.heading}
                  </h3>
                  <div className="prose-notes mt-2">
                    {section.content.split(/\n{2,}/).map((p, j) => (
                      <p key={j}>{p.trim()}</p>
                    ))}
                  </div>
                  {section.subsections && section.subsections.length > 0 && (
                    <div className="mt-3 space-y-3 border-l-2 border-[rgb(var(--primary))]/30 pl-4">
                      {section.subsections.map((sub, k) => (
                        <div key={k}>
                          <h4 className="note-subheading">{sub.heading}</h4>
                          <div className="prose-notes">
                            {sub.content.split(/\n{2,}/).map((p, l) => (
                              <p key={l}>{p.trim()}</p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <Empty text="No detailed breakdown was generated." />
          )}
        </Section>

        <Section
          icon={<BarChart3 className="h-3.5 w-3.5" />}
          title="Important Facts & Numbers"
        >
          {summary.importantFacts.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {summary.importantFacts.map((fact, i) => (
                <li
                  key={i}
                  className="note-card flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-50/40 p-3 text-sm dark:bg-amber-500/5"
                >
                  <span className="mt-0.5 text-base leading-none">📊</span>
                  <span className="text-pretty leading-relaxed text-[rgb(var(--foreground))]">
                    {fact}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="No specific facts were extracted." />
          )}
        </Section>

        <Section
          icon={<CheckSquare className="h-3.5 w-3.5" />}
          title="Action Items"
        >
          {summary.actionItems.length > 0 ? (
            <ol className="space-y-2">
              {summary.actionItems.map((item, i) => (
                <li
                  key={i}
                  className="note-card flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-50/40 p-3 text-sm dark:bg-emerald-500/5"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-emerald-500 text-[10px] font-bold text-white">
                    ✓
                  </span>
                  <span className="text-pretty leading-relaxed text-[rgb(var(--foreground))]">
                    {item}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty text="No action items were generated." />
          )}
        </Section>

        <Section
          icon={<Clock className="h-3.5 w-3.5" />}
          title="Timeline"
        >
          {summary.timeline.length > 0 ? (
            <ol className="divide-y divide-[rgb(var(--border))] overflow-hidden rounded-xl border border-[rgb(var(--border))]">
              {summary.timeline.map((ts, i) => (
                <li key={i}>
                  <a
                    href={`https://www.youtube.com/watch?v=${summary.videoId}&t=${Math.floor(ts.time)}s`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex w-full items-start gap-3 p-3 transition hover:bg-[rgb(var(--muted))] sm:p-4"
                  >
                    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-[rgb(var(--accent))] px-2 py-1 font-mono text-xs font-semibold text-[rgb(var(--accent-foreground))]">
                      <Clock className="h-3 w-3" />
                      {ts.display}
                    </span>
                    <span className="flex-1 text-sm text-[rgb(var(--foreground))] sm:text-base">
                      {ts.label}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          ) : (
            <Empty text="No timeline was generated." />
          )}
        </Section>

        <Section
          icon={<HelpCircle className="h-3.5 w-3.5" />}
          title="Frequently Asked Questions"
        >
          {summary.faq.length > 0 ? (
            <div className="divide-y divide-[rgb(var(--border))] overflow-hidden rounded-xl border border-[rgb(var(--border))]">
              {summary.faq.map((item, i) => (
                <details
                  key={i}
                  className="group p-4 sm:p-5"
                >
                  <summary className="flex cursor-pointer list-none items-start gap-3 text-pretty font-semibold text-[rgb(var(--foreground))]">
                    <span className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[rgb(var(--primary))] text-[11px] font-bold text-white">
                      Q
                    </span>
                    <span className="flex-1">{item.question}</span>
                    <span className="text-[rgb(var(--muted-foreground))] transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="mt-3 flex items-start gap-3 pl-9 text-pretty text-sm text-[rgb(var(--muted-foreground))] sm:text-base">
                    <span className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[rgb(var(--accent))] text-[11px] font-bold text-[rgb(var(--accent-foreground))]">
                      A
                    </span>
                    <span className="flex-1 leading-relaxed">{item.answer}</span>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <Empty text="No FAQ was generated." />
          )}
        </Section>

        <footer className="flex items-center justify-between border-t border-[rgb(var(--border))] pt-4 text-xs text-[rgb(var(--muted-foreground))]">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            Generated {new Date().toLocaleDateString()}
          </span>
          <span>YouTube Summary Generator</span>
        </footer>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="note-section-heading">
        <span className="icon">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-[rgb(var(--muted-foreground))]">{text}</p>;
}

/**
 * Build a clean markdown representation of the AI Notes for clipboard export.
 */
function buildMarkdown(summary: SummaryResponse): string {
  const lines: string[] = [];
  lines.push(`# ${summary.title}`);
  lines.push(
    `> Source: https://www.youtube.com/watch?v=${summary.videoId}`
  );
  lines.push("");

  if (summary.executiveSummary) {
    lines.push("## Executive Summary");
    lines.push("");
    lines.push(summary.executiveSummary);
    lines.push("");
  }

  if (summary.keyTakeaways.length > 0) {
    lines.push("## Key Takeaways");
    lines.push("");
    for (const t of summary.keyTakeaways) lines.push(`- ${t}`);
    lines.push("");
  }

  if (summary.detailedBreakdown.length > 0) {
    lines.push("## Detailed Breakdown");
    lines.push("");
    for (const section of summary.detailedBreakdown) {
      lines.push(`### ${section.heading}`);
      lines.push("");
      lines.push(section.content);
      if (section.subsections) {
        for (const sub of section.subsections) {
          lines.push(`#### ${sub.heading}`);
          lines.push("");
          lines.push(sub.content);
        }
      }
      lines.push("");
    }
  }

  if (summary.importantFacts.length > 0) {
    lines.push("## Important Facts & Numbers");
    lines.push("");
    for (const f of summary.importantFacts) lines.push(`- ${f}`);
    lines.push("");
  }

  if (summary.actionItems.length > 0) {
    lines.push("## Action Items");
    lines.push("");
    for (const a of summary.actionItems) lines.push(`- ${a}`);
    lines.push("");
  }

  if (summary.timeline.length > 0) {
    lines.push("## Timeline");
    lines.push("");
    for (const t of summary.timeline) {
      lines.push(`- \`${t.display}\` — ${t.label}`);
    }
    lines.push("");
  }

  if (summary.faq.length > 0) {
    lines.push("## Frequently Asked Questions");
    lines.push("");
    for (const f of summary.faq) {
      lines.push(`**Q: ${f.question}**`);
      lines.push(`A: ${f.answer}`);
      lines.push("");
    }
  }

  return lines.join("\n").trim() + "\n";
}
