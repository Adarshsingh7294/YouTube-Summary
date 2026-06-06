import { jsPDF } from "jspdf";
import type { SummaryResponse } from "./types";

const COLORS = {
  text: [30, 30, 45] as const,
  textMuted: [100, 110, 130] as const,
  primary: [99, 102, 241] as const,
  accent: [67, 56, 202] as const,
  border: [220, 220, 230] as const,
  fact: [180, 83, 9] as const, // amber-700
  action: [6, 95, 70] as const, // emerald-800
};

/**
 * Build a printable PDF of the AI Notes. Renders:
 *   - Title + source URL
 *   - Executive Summary
 *   - Key Takeaways (numbered)
 *   - Detailed Breakdown (with numbered section headings and sub-headings)
 *   - Important Facts & Numbers
 *   - Action Items
 *   - Timeline
 *   - FAQ
 */
export function buildSummaryPdf(summary: SummaryResponse): jsPDF {
  const doc = new jsPDF({
    unit: "pt",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 48;
  const contentWidth = pageWidth - marginX * 2;
  let cursorY = 56;

  const setText = (
    color: readonly [number, number, number],
    weight: "normal" | "bold" = "normal",
    size = 11
  ) => {
    doc.setFont("helvetica", weight);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  };

  const ensureSpace = (needed: number) => {
    if (cursorY + needed > pageHeight - 60) {
      doc.addPage();
      cursorY = 56;
    }
  };

  const drawDivider = () => {
    ensureSpace(16);
    doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2]);
    doc.setLineWidth(0.5);
    doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
    cursorY += 16;
  };

  const sectionHeading = (text: string) => {
    ensureSpace(40);
    setText(COLORS.primary, "bold", 14);
    doc.text(text, marginX, cursorY);
    cursorY += 8;
    setText(COLORS.text, "normal", 11);
    cursorY += 14;
  };

  const addParagraphs = (text: string) => {
    const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    for (const para of paragraphs) {
      const lines = doc.splitTextToSize(para, contentWidth);
      ensureSpace(lines.length * 14 + 8);
      doc.text(lines, marginX, cursorY);
      cursorY += lines.length * 14 + 8;
    }
  };

  // ----- Title -----
  setText(COLORS.text, "bold", 22);
  const titleLines = doc.splitTextToSize(summary.title || "AI Notes", contentWidth);
  ensureSpace(titleLines.length * 26 + 6);
  doc.text(titleLines, marginX, cursorY);
  cursorY += titleLines.length * 26 + 4;

  // URL
  setText(COLORS.textMuted, "normal", 9);
  const url = `https://www.youtube.com/watch?v=${summary.videoId}`;
  doc.text(url, marginX, cursorY);
  cursorY += 16;

  drawDivider();

  // ----- Executive Summary -----
  if (summary.executiveSummary) {
    sectionHeading("Executive Summary");
    addParagraphs(summary.executiveSummary);
    cursorY += 8;
  }

  // ----- Key Takeaways -----
  if (summary.keyTakeaways.length > 0) {
    sectionHeading("Key Takeaways");
    summary.keyTakeaways.forEach((item, i) => {
      const lines = doc.splitTextToSize(`${i + 1}. ${item}`, contentWidth - 8);
      ensureSpace(lines.length * 14 + 4);
      doc.text(lines, marginX, cursorY);
      cursorY += lines.length * 14 + 4;
    });
    cursorY += 8;
  }

  // ----- Detailed Breakdown -----
  if (summary.detailedBreakdown.length > 0) {
    sectionHeading("Detailed Breakdown");
    summary.detailedBreakdown.forEach((section, i) => {
      ensureSpace(36);
      setText(COLORS.accent, "bold", 12);
      doc.text(`${i + 1}. ${section.heading}`, marginX, cursorY);
      cursorY += 18;
      setText(COLORS.text, "normal", 11);
      const lines = doc.splitTextToSize(section.content, contentWidth);
      ensureSpace(lines.length * 14 + 6);
      doc.text(lines, marginX, cursorY);
      cursorY += lines.length * 14 + 6;
      if (section.subsections) {
        for (const sub of section.subsections) {
          ensureSpace(28);
          setText(COLORS.text, "bold", 10.5);
          doc.text(sub.heading, marginX + 12, cursorY);
          cursorY += 14;
          setText(COLORS.text, "normal", 10.5);
          const sl = doc.splitTextToSize(sub.content, contentWidth - 16);
          ensureSpace(sl.length * 13 + 4);
          doc.text(sl, marginX + 12, cursorY);
          cursorY += sl.length * 13 + 4;
        }
      }
      cursorY += 4;
    });
    cursorY += 8;
  }

  // ----- Important Facts & Numbers -----
  if (summary.importantFacts.length > 0) {
    sectionHeading("Important Facts & Numbers");
    summary.importantFacts.forEach((fact) => {
      const lines = doc.splitTextToSize(`• ${fact}`, contentWidth - 8);
      ensureSpace(lines.length * 14 + 4);
      setText(COLORS.fact, "normal", 10.5);
      doc.text(lines, marginX, cursorY);
      cursorY += lines.length * 14 + 4;
    });
    cursorY += 8;
  }

  // ----- Action Items -----
  if (summary.actionItems.length > 0) {
    sectionHeading("Action Items");
    summary.actionItems.forEach((item) => {
      const lines = doc.splitTextToSize(`✓ ${item}`, contentWidth - 8);
      ensureSpace(lines.length * 14 + 4);
      setText(COLORS.action, "normal", 10.5);
      doc.text(lines, marginX, cursorY);
      cursorY += lines.length * 14 + 4;
    });
    cursorY += 8;
  }

  // ----- Timeline -----
  if (summary.timeline.length > 0) {
    sectionHeading("Timeline");
    summary.timeline.forEach((t) => {
      const line = `[${t.display}]  ${t.label}`;
      const lines = doc.splitTextToSize(line, contentWidth - 8);
      ensureSpace(lines.length * 14 + 4);
      setText(COLORS.text, "normal", 10.5);
      doc.text(lines, marginX, cursorY);
      cursorY += lines.length * 14 + 4;
    });
    cursorY += 8;
  }

  // ----- FAQ -----
  if (summary.faq.length > 0) {
    sectionHeading("Frequently Asked Questions");
    summary.faq.forEach((f, i) => {
      ensureSpace(36);
      setText(COLORS.text, "bold", 11);
      const q = `Q${i + 1}. ${f.question}`;
      const qLines = doc.splitTextToSize(q, contentWidth);
      doc.text(qLines, marginX, cursorY);
      cursorY += qLines.length * 14 + 2;
      setText(COLORS.text, "normal", 10.5);
      const aLines = doc.splitTextToSize(`A: ${f.answer}`, contentWidth - 8);
      ensureSpace(aLines.length * 13 + 8);
      doc.text(aLines, marginX + 8, cursorY);
      cursorY += aLines.length * 13 + 8;
    });
  }

  // ----- Footer on each page -----
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    setText(COLORS.textMuted, "normal", 9);
    const footer = `Generated by YouTube Summary Generator — Page ${i} of ${totalPages}`;
    doc.text(footer, marginX, pageHeight - 28);
  }

  return doc;
}

export function downloadSummaryPdf(summary: SummaryResponse): void {
  const doc = buildSummaryPdf(summary);
  const safeTitle = (summary.title || "ai-notes")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "ai-notes";
  doc.save(`${safeTitle}.pdf`);
}
