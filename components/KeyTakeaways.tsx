"use client";

import { CheckCircle2 } from "lucide-react";

export default function KeyTakeaways({ items }: { items: string[] }) {
  if (!items || items.length === 0) {
    return (
      <p className="text-sm text-[rgb(var(--muted-foreground))]">
        No takeaways were returned.
      </p>
    );
  }
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex items-start gap-3 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--muted))] p-3 text-sm text-[rgb(var(--foreground))] sm:text-base"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
          <span className="text-pretty leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}
