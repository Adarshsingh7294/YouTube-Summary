import "server-only";
import {
  fetchTranscript as fetchTranscriptPlus,
  YoutubeTranscriptNotAvailableError as PlusNotAvailable,
  YoutubeTranscriptVideoUnavailableError as PlusVideoUnavailable,
  YoutubeTranscriptInvalidVideoIdError as PlusInvalidId,
  YoutubeTranscriptTooManyRequestError as PlusRateLimited,
  YoutubeTranscriptDisabledError as PlusDisabled,
} from "youtube-transcript-plus";
import { fetchTranscript as fetchTranscriptLegacy } from "youtube-transcript";
import type { TranscriptSegment as RawSegmentPlus } from "youtube-transcript-plus";
import type { TranscriptResponse as RawSegmentLegacy } from "youtube-transcript";
import type { Timestamp, TranscriptSegment } from "./types";
import { formatTimestamp } from "./youtube-utils";

// Re-export client-safe helpers so the rest of the app still imports from
// "@/lib/youtube" in server code.
export { extractVideoId, formatTimestamp } from "./youtube-utils";

/**
 * Thrown when every transcript provider we tried failed. Carries the list of
 * attempts so callers (and the API route) can produce a useful message.
 */
export class TranscriptFetchError extends Error {
  readonly videoId: string;
  readonly attempts: { provider: string; error: unknown }[];

  constructor(videoId: string, attempts: { provider: string; error: unknown }[]) {
    const summary = attempts
      .map(
        (a) =>
          `  - ${a.provider}: ${
            a.error instanceof Error ? a.error.message : String(a.error)
          }`
      )
      .join("\n");
    super(
      `All transcript providers failed for video ${videoId}:\n${summary}`
    );
    this.name = "TranscriptFetchError";
    this.videoId = videoId;
    this.attempts = attempts;
  }
}

/**
 * Decide whether a thrown error from a provider is worth retrying against a
 * fallback. "Fatal" errors (invalid ID, video genuinely missing) won't get
 * better with a second provider, so we skip the fallback for those.
 */
function isTransientError(err: unknown): boolean {
  if (!err) return false;
  // youtube-transcript-plus typed errors
  if (
    err instanceof PlusRateLimited ||
    err instanceof PlusNotAvailable ||
    err instanceof PlusDisabled
  ) {
    return true;
  }
  // Fatal — don't waste a second call
  if (err instanceof PlusInvalidId || err instanceof PlusVideoUnavailable) {
    return false;
  }
  // Legacy package throws plain YoutubeTranscriptError with a message; treat
  // "not available / disabled / too many requests" as transient.
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      /not\s*avail|disabled|too many|429|captions? are disabled|fetch failed|network|econnrefused|etimedout|enotfound|socket hang up|aborted/i.test(
        msg
      )
    ) {
      return true;
    }
  }
  // Unknown error from the primary — still worth a fallback attempt
  return true;
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name && err.name !== "Error" ? ` [${err.name}]` : "";
    return `${err.message}${name}`;
  }
  return String(err);
}

function logProviderFailure(
  provider: string,
  videoId: string,
  err: unknown
): void {
  const message = describeError(err);
  const stack = err instanceof Error ? err.stack : undefined;
  // Single line for log aggregators, then the stack on the next line.
  console.error(
    `[transcript] ${provider} failed for video ${videoId}: ${message}`
  );
  if (stack) {
    console.error(stack);
  }
}

/**
 * Run a single provider, normalizing the returned segments into our internal
 * `TranscriptSegment` shape. Throws on failure.
 */
async function runProvider(
  provider: "youtube-transcript-plus" | "youtube-transcript",
  videoId: string
): Promise<TranscriptSegment[]> {
  if (provider === "youtube-transcript-plus") {
    const items: RawSegmentPlus[] = await fetchTranscriptPlus(videoId);
    return items.map((item) => ({
      text: decodeHtmlEntities(item.text).replace(/\s+/g, " ").trim(),
      offset: item.offset, // already in seconds
      duration: item.duration ?? 0,
    }));
  }

  // Legacy package — accepts either a bare 11-char id or a full URL.
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const items: RawSegmentLegacy[] = await fetchTranscriptLegacy(url);
  return items.map((item) => ({
    text: decodeHtmlEntities(item.text).replace(/\s+/g, " ").trim(),
    offset: item.offset, // already in seconds
    duration: item.duration ?? 0,
  }));
}

/**
 * Fetch the transcript for a YouTube video.
 *
 * Tries `youtube-transcript-plus` first, then falls back to the older
 * `youtube-transcript` package if the primary fails with a transient error
 * (rate limit, network blip, etc.). On Vercel, the primary often gets blocked
 * by YouTube's bot detection; the legacy package uses a slightly different
 * fetch path (InnerTube Android client) that usually still works.
 *
 * @throws {TranscriptFetchError} if every provider fails. The `attempts` field
 *   has one entry per provider tried.
 */
export async function fetchTranscript(
  videoId: string
): Promise<TranscriptSegment[]> {
  const providers = [
    "youtube-transcript-plus",
    "youtube-transcript",
  ] as const;

  const attempts: { provider: string; error: unknown }[] = [];

  for (const provider of providers) {
    try {
      return await runProvider(provider, videoId);
    } catch (err) {
      logProviderFailure(provider, videoId, err);
      attempts.push({ provider, error: err });

      // If the error is clearly fatal (bad ID, video gone), there's no point
      // burning a second provider — bail straight to the aggregate error.
      if (!isTransientError(err)) {
        break;
      }
    }
  }

  throw new TranscriptFetchError(videoId, attempts);
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
