"use client";

export default function DetailedSummary({ text }: { text: string }) {
  if (!text) return null;
  // Split on blank lines for natural paragraph rendering
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="space-y-4 text-pretty text-sm leading-relaxed text-[rgb(var(--foreground))] sm:text-base">
      {paragraphs.length > 1 ? (
        paragraphs.map((p, i) => <p key={i}>{p}</p>)
      ) : (
        <p>{text}</p>
      )}
    </div>
  );
}
