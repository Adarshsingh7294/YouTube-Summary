"use client";

import { Sparkles } from "lucide-react";

export default function ShortSummary({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="text-pretty text-base leading-relaxed text-[rgb(var(--foreground))] sm:text-lg">
      <Sparkles className="mr-2 inline h-4 w-4 -translate-y-0.5 text-[rgb(var(--primary))]" />
      {text}
    </p>
  );
}
