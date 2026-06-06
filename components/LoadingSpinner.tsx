"use client";

import { Loader2, Brain, FileText, ListChecks, Clock } from "lucide-react";

const stages = [
  { icon: FileText, label: "Fetching transcript" },
  { icon: Brain, label: "Analyzing content" },
  { icon: ListChecks, label: "Generating summaries" },
  { icon: Clock, label: "Building timestamps" },
];

export default function LoadingSpinner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="card-surface mx-auto flex max-w-xl flex-col items-center gap-5 p-8 text-center"
    >
      <div className="relative">
        <div className="gradient-bg absolute inset-0 rounded-full opacity-30 blur-xl animate-pulse-slow" />
        <div className="gradient-bg relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      </div>
      <div>
        <h3 className="text-base font-semibold">Working on it...</h3>
        <p className="mt-1 text-sm text-[rgb(var(--muted-foreground))]">
          This usually takes 15-45 seconds depending on video length.
        </p>
      </div>
      <ul className="grid w-full grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {stages.map(({ icon: Icon, label }) => (
          <li
            key={label}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--muted))] px-2 py-2 text-[rgb(var(--muted-foreground))] animate-pulse-slow"
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
