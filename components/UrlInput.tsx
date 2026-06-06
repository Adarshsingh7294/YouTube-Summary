"use client";

import { useState } from "react";
import { Loader2, Link2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { extractVideoId } from "@/lib/youtube-utils";
import type { SummaryResponse } from "@/lib/types";
import SummaryDisplay from "./SummaryDisplay";
import ErrorMessage from "./ErrorMessage";
import LoadingSpinner from "./LoadingSpinner";

export default function UrlInput() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please paste a YouTube URL first.");
      return;
    }
    if (!extractVideoId(trimmed)) {
      setError(
        "That doesn't look like a valid YouTube URL. Try a link like https://www.youtube.com/watch?v=..."
      );
      return;
    }

    setError(null);
    setSummary(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message =
          (data && typeof data === "object" && "error" in data && typeof (data as { error: string }).error === "string"
            ? (data as { error: string }).error
            : null) || "Failed to summarize the video.";
        setError(message);
        toast.error(message);
        return;
      }
      setSummary(data as SummaryResponse);
      toast.success("Summary ready!");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Network error. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSample = () => {
    // We don't actually fetch this — it's a placeholder so the user can
    // quickly try the input field.
    setUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  };

  return (
    <section className="mx-auto max-w-3xl">
      <form
        onSubmit={handleSubmit}
        className="card-surface flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-2"
        aria-label="Summarize a YouTube video"
      >
        <div className="relative flex flex-1 items-center">
          <Link2 className="pointer-events-none absolute left-3 h-4 w-4 text-[rgb(var(--muted-foreground))]" />
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
            aria-label="YouTube URL"
            className="h-12 w-full rounded-lg border border-transparent bg-[rgb(var(--muted))] pl-9 pr-3 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))] outline-none transition focus:border-[rgb(var(--primary))] focus:bg-[rgb(var(--card))] focus:ring-2 focus:ring-[rgb(var(--primary))]/20 disabled:cursor-not-allowed disabled:opacity-60 sm:h-11"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="gradient-bg inline-flex h-12 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:h-11"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Summarizing...
            </>
          ) : (
            <>
              Summarize
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-3 flex items-center justify-between px-1 text-xs text-[rgb(var(--muted-foreground))]">
        <span>Tip: works with youtu.be, /watch, /shorts, /embed links.</span>
        {!isLoading && !summary && (
          <button
            type="button"
            onClick={handleSample}
            className="rounded-md px-2 py-1 transition hover:text-[rgb(var(--primary))]"
          >
            Try a sample URL
          </button>
        )}
      </div>

      {error && (
        <div className="mt-6">
          <ErrorMessage message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {isLoading && (
        <div className="mt-10">
          <LoadingSpinner />
        </div>
      )}

      {summary && !isLoading && (
        <div className="mt-10 animate-fade-up">
          <SummaryDisplay summary={summary} />
        </div>
      )}
    </section>
  );
}
