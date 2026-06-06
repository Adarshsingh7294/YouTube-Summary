"use client";

import { Clock, ExternalLink } from "lucide-react";
import type { Timestamp } from "@/lib/types";
import { formatTimestamp } from "@/lib/youtube-utils";

export default function Timestamps({
  items,
  videoId,
}: {
  items: Timestamp[];
  videoId: string;
}) {
  if (!items || items.length === 0) {
    return (
      <p className="text-sm text-[rgb(var(--muted-foreground))]">
        No timestamps were generated.
      </p>
    );
  }

  const handleClick = (seconds: number) => {
    const url = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(seconds)}s`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <ol className="divide-y divide-[rgb(var(--border))] overflow-hidden rounded-xl border border-[rgb(var(--border))]">
      {items.map((ts, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => handleClick(ts.time)}
            className="group flex w-full items-start gap-4 p-3 text-left transition hover:bg-[rgb(var(--muted))] sm:p-4"
          >
            <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md bg-[rgb(var(--accent))] px-2 py-1 font-mono text-xs font-medium text-[rgb(var(--accent-foreground))]">
              <Clock className="h-3 w-3" />
              {formatTimestamp(ts.time)}
            </span>
            <span className="flex-1 text-sm text-[rgb(var(--foreground))] sm:text-base">
              {ts.text}
            </span>
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[rgb(var(--muted-foreground))] opacity-0 transition group-hover:opacity-100" />
          </button>
        </li>
      ))}
    </ol>
  );
}
