"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { SummaryResponse } from "@/lib/types";
import { downloadSummaryPdf } from "@/lib/pdf";

export default function DownloadPdfButton({ summary }: { summary: SummaryResponse }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      // Defer to next tick so the spinner can render before we block the
      // main thread with PDF generation.
      await new Promise((r) => setTimeout(r, 50));
      downloadSummaryPdf(summary);
      toast.success("PDF downloaded");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate PDF.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--card))] px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--muted-foreground))] transition hover:border-[rgb(var(--primary))] hover:text-[rgb(var(--primary))] disabled:cursor-not-allowed disabled:opacity-50"
      aria-label="Download as PDF"
    >
      {loading ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Preparing...</span>
        </>
      ) : (
        <>
          <FileDown className="h-3.5 w-3.5" />
          <span>Download PDF</span>
        </>
      )}
    </button>
  );
}
