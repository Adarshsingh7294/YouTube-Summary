export type SummaryType = "short" | "detailed" | "takeaways";

export interface TranscriptSegment {
  text: string;
  offset: number; // seconds
  duration: number; // seconds
}

export interface Timestamp {
  time: number; // seconds
  display: string; // formatted e.g. "01:23"
  text: string;
}

// ----- AI Notes schema -----

export interface FaqItem {
  question: string;
  answer: string;
}

export interface BreakdownSection {
  heading: string; // e.g. "Mathematics Strategy"
  content: string; // markdown allowed
  subsections?: { heading: string; content: string }[];
}

export interface TimelineEntry {
  time: number; // seconds
  display: string; // e.g. "02:15"
  label: string;
}

export interface AiNotes {
  executiveSummary: string; // 2-3 paragraphs, joined with \n\n
  keyTakeaways: string[]; // bullets
  detailedBreakdown: BreakdownSection[]; // sectioned with headings
  importantFacts: string[]; // statistics, scores, dates, percentages
  actionItems: string[]; // what viewer should do
  timeline: TimelineEntry[];
  faq: FaqItem[];
}

export interface SummaryResponse extends AiNotes {
  title: string;
  videoId: string;
}

export interface SummarizeRequestBody {
  url: string;
}

export interface ApiError {
  error: string;
}
