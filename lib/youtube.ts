import "server-only";
import { fetchTranscript as fetchTranscriptRaw } from "youtube-transcript-plus";
import type { TranscriptSegment as RawSegment } from "youtube-transcript-plus";
import type { Timestamp, TranscriptSegment } from "./types";
import { formatTimestamp } from "./youtube-utils";

// Re-export client-safe helpers so the rest of the app still imports from
// "@/lib/youtube" in server code.
export { extractVideoId, formatTimestamp } from "./youtube-utils";

/**
 * Fetch the transcript for a YouTube video.
 * Returns an array of segments with text and timestamps.
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptSegment[]> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const items: RawSegment[] = await fetchTranscriptRaw(url);

  return items.map((item) => ({
    text: decodeHtmlEntities(item.text).replace(/\s+/g, " ").trim(),
    offset: item.offset, // already in seconds
    duration: item.duration ?? 0,
  }));
}

/**
 * Build timestamps from transcript segments. Groups contiguous short segments
 * into coherent chunks so the user gets a readable list rather than every
 * individual line.
 */
export function buildTimestamps(
  segments: TranscriptSegment[],
  options: { maxItems?: number; minChunkSeconds?: number } = {}
): Timestamp[] {
  const maxItems = options.maxItems ?? 12;
  const minChunkSeconds = options.minChunkSeconds ?? 20;

  if (segments.length === 0) return [];

  // Group segments into chunks separated by larger gaps or by total duration.
  const chunks: { start: number; end: number; texts: string[] }[] = [];
  let current: { start: number; end: number; texts: string[] } | null = null;

  for (const seg of segments) {
    const segStart = seg.offset;
    const segEnd = seg.offset + seg.duration;
    if (!current) {
      current = { start: segStart, end: segEnd, texts: [seg.text] };
      continue;
    }
    const gap = segStart - current.end;
    const isLongEnough = segEnd - current.start >= minChunkSeconds;
    if (gap > 3 && isLongEnough) {
      chunks.push(current);
      current = { start: segStart, end: segEnd, texts: [seg.text] };
    } else {
      current.end = segEnd;
      current.texts.push(seg.text);
    }
  }
  if (current) chunks.push(current);

  // If we have too many chunks, sample evenly across the video.
  let sampled = chunks;
  if (chunks.length > maxItems) {
    const step = chunks.length / maxItems;
    sampled = Array.from({ length: maxItems }, (_, i) => chunks[Math.floor(i * step)]);
  }

  return sampled.map((c) => ({
    time: c.start,
    display: formatTimestamp(c.start),
    text: c.texts.join(" ").replace(/\s+/g, " ").trim(),
  }));
}

/**
 * Build a single concatenated transcript text for the LLM prompt.
 */
export function transcriptToText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => s.text)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
