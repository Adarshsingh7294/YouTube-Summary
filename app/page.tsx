import UrlInput from "@/components/UrlInput";
import SummaryDisplay from "@/components/SummaryDisplay";
import ThemeToggle from "@/components/ThemeToggle";
import { Sparkles, Github, Zap } from "lucide-react";
import type { SummaryResponse } from "@/lib/types";

export default function HomePage() {
  // Client-side data holder
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Decorative background gradient */}
      <div className="pointer-events-none absolute inset-0 gradient-bg-soft" />

      {/* Header */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="gradient-bg flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-lg">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            YouTube Summary
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hidden h-10 w-10 items-center justify-center rounded-full border border-[rgb(var(--border))] text-[rgb(var(--muted-foreground))] transition hover:border-[rgb(var(--primary))] hover:text-[rgb(var(--primary))] sm:flex"
            aria-label="View source on GitHub"
          >
            <Github className="h-4.5 w-4.5" />
          </a>
          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <Hero />
        <div className="mt-10">
          <UrlInputWrapper />
        </div>
        <Features />
        <Footer />
      </main>
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto mt-10 max-w-3xl text-center sm:mt-16">
      <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-3 py-1 text-xs font-medium text-[rgb(var(--muted-foreground))] shadow-sm">
        <Zap className="h-3.5 w-3.5 text-amber-500" />
        Powered by OpenAI-compatible LLMs
      </div>
      <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
        Summarize any{" "}
        <span className="gradient-text">YouTube video</span> in seconds.
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-[rgb(var(--muted-foreground))] sm:text-lg">
        Paste a link, get a full set of AI Notes — executive summary, key
        takeaways, detailed breakdown, important facts, action items,
        timeline, and FAQ. Export to PDF with one click.
      </p>
    </section>
  );
}

function UrlInputWrapper() {
  // The actual interactive part is the UrlInput client component.
  return <UrlInput />;
}

function Features() {
  const features = [
    {
      title: "Three summary views",
      body: "Short, detailed, and key takeaways — all generated in one pass.",
    },
    {
      title: "Timestamps you can scan",
      body: "Auto-generated chapter markers so you can jump to what matters.",
    },
    {
      title: "Bring your own model",
      body: "OpenAI-compatible API: point at OpenAI, Groq, OpenRouter, Ollama, or anything else.",
    },
    {
      title: "Export anywhere",
      body: "Copy a single click or download a polished PDF ready to share.",
    },
  ];
  return (
    <section className="mt-20 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {features.map((f) => (
        <div
          key={f.title}
          className="card-surface p-5 transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="mb-2 h-8 w-8 rounded-lg bg-[rgb(var(--accent))] text-[rgb(var(--accent-foreground))] grid place-items-center">
            <Sparkles className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold">{f.title}</h3>
          <p className="mt-1 text-sm text-[rgb(var(--muted-foreground))]">
            {f.body}
          </p>
        </div>
      ))}
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-20 border-t border-[rgb(var(--border))] pt-6 text-center text-xs text-[rgb(var(--muted-foreground))]">
      Built with Next.js 15, Tailwind CSS, and the OpenAI SDK. Transcripts
      courtesy of YouTube.
    </footer>
  );
}

// We re-export the type so client components that import from the page file
// (e.g. via barrel imports) can still resolve it.
export type { SummaryResponse };
