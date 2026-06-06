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
  if (
    err instanceof PlusRateLimited ||
    err instanceof PlusNotAvailable ||
    err instanceof PlusDisabled
  ) {
    return true;
  }
  if (err instanceof PlusInvalidId || err instanceof PlusVideoUnavailable) {
    return false;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      /not\s*avail|disabled|too many|429|403|captions? are disabled|fetch failed|network|econnrefused|etimedout|enotfound|socket hang up|aborted|empty transcript|no <text|parse error/i.test(
        msg
      )
    ) {
      return true;
    }
  }
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
  console.error(
    `[transcript] ${provider} failed for video ${videoId}: ${message}`
  );
  if (stack) {
    console.error(stack);
  }
}

/**
 * Provider 3 — hit YouTube's `timedtext` endpoint directly. This is a stable
 * server-side API that serves caption tracks as XML and tends to work from
 * serverless IPs (where the watch page + InnerTube endpoints get bot-flagged).
 *
 * It only works for videos that have *published* captions, but those are the
 * ones that matter most (auto-generated tracks only show up via the other
 * providers). We try English first, then fall back to any available track.
 */
async function runTimedTextProvider(videoId: string): Promise<TranscriptSegment[]> {
  // Step 1 — list available caption tracks. The watch page still serves us
  // the tracklist even when scraping the transcript itself is blocked, but
  // we hit the player response JSON directly which is cheaper.
  const playerUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const watchRes = await fetch(playerUrl, {
    headers: {
      // A real desktop Chrome UA dramatically improves the chance of getting
      // the full player response back rather than a consent/bot-check page.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    cache: "no-store",
  });

  if (!watchRes.ok) {
    throw new Error(
      `watch page returned HTTP ${watchRes.status} ${watchRes.statusText}`
    );
  }
  const html = await watchRes.text();

  // Pull the captionTracks array out of the embedded player response.
  // Match either `captionTracks":[{...}]` (new) or the older wrapper.
  const tracks = extractCaptionTracks(html);
  if (tracks.length === 0) {
    throw new Error(
      "no captionTracks found in watch page (video may be private, region-locked, or have no captions)"
    );
  }

  // Prefer an English manual track; fall back to first available.
  const preferred =
    tracks.find(
      (t) => t.languageCode.startsWith("en") && !t.kind?.includes("asr")
    ) ??
    tracks.find((t) => t.languageCode.startsWith("en")) ??
    tracks[0];

  if (!preferred.baseUrl) {
    throw new Error("selected caption track has no baseUrl");
  }

  // Step 2 — fetch the actual caption XML.
  const captionUrl = preferred.baseUrl.replace(/&fmt=/, "&fmt=srv3");
  const captionRes = await fetch(captionUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    cache: "no-store",
  });
  if (!captionRes.ok) {
    throw new Error(
      `timedtext returned HTTP ${captionRes.status} ${captionRes.statusText}`
    );
  }
  const xml = await captionRes.text();
  if (!xml || !/<(p|text)\b/i.test(xml)) {
    throw new Error("timedtext returned empty or non-XML body");
  }

  return parseCaptionXml(xml);
}

interface CaptionTrack {
  baseUrl?: string;
  languageCode: string;
  kind?: string; // "asr" = auto-generated
}

function extractCaptionTracks(html: string): CaptionTrack[] {
  // Find the `captionTracks":[{...}]` block. The JSON can be huge, so we
  // anchor on the field name and grab the surrounding braces carefully.
  const out: CaptionTrack[] = [];

  // The watch page embeds the player response in `ytInitialPlayerResponse = {...}`.
  // We just need a window into the captionTracks array; the JSON is well-formed
  // even if the rest of the page is huge.
  const idx = html.indexOf('"captionTracks":[');
  if (idx === -1) return out;

  // Walk the array with a brace counter rather than a regex (avoids grabbing
  // a trailing comma / nested array mess).
  const start = html.indexOf("[", idx);
  if (start === -1) return out;
  let depth = 0;
  let end = -1;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return out;

  const slice = html.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return out;
  }
  if (!Array.isArray(parsed)) return out;

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const baseUrl =
      typeof obj.baseUrl === "string"
        ? obj.baseUrl
        : typeof obj.url === "string"
        ? obj.url
        : undefined;
    const languageCode =
      typeof obj.languageCode === "string" ? obj.languageCode : "";
    if (!baseUrl || !languageCode) continue;
    out.push({
      baseUrl,
      languageCode,
      kind: typeof obj.kind === "string" ? obj.kind : undefined,
    });
  }
  return out;
}

function parseCaptionXml(xml: string): TranscriptSegment[] {
  // Supports both classic format:
  //   <text start="1.23" dur="4.5">Hello</text>
  // and the newer srv3 format:
  //   <p t="1230" d="4500"><s>Hel</s><s>lo</s></p>
  const segments: TranscriptSegment[] = [];

  const classicRe =
    /<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/gi;
  let m: RegExpExecArray | null;
  let any = false;

  while ((m = classicRe.exec(xml)) !== null) {
    any = true;
    const offsetSec = parseFloat(m[1]);
    const durSec = m[2] ? parseFloat(m[2]) : 0;
    const raw = m[3]
      .replace(/<[^>]+>/g, "") // strip any inner tags
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) continue;
    segments.push({
      text: raw,
      offset: Number.isFinite(offsetSec) ? offsetSec : 0,
      duration: Number.isFinite(durSec) ? durSec : 0,
    });
  }

  if (segments.length > 0) return segments;

  // srv3 fallback
  const srv3Re = /<p\s+t="(\d+)"(?:\s+d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/gi;
  while ((m = srv3Re.exec(xml)) !== null) {
    any = true;
    const offsetSec = parseInt(m[1], 10) / 1000;
    const durSec = m[2] ? parseInt(m[2], 10) / 1000 : 0;
    const raw = m[3]
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) continue;
    segments.push({
      text: raw,
      offset: Number.isFinite(offsetSec) ? offsetSec : 0,
      duration: Number.isFinite(durSec) ? durSec : 0,
    });
  }

  if (!any) {
    throw new Error("timedtext XML had no <text> or <p> cues");
  }
  return segments;
}

/**
 * Run a single provider, normalizing the returned segments into our internal
 * `TranscriptSegment` shape. Throws on failure.
 */
async function runProvider(
  provider:
    | "youtube-transcript-plus"
    | "youtube-transcript"
    | "youtube-timedtext",
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

  if (provider === "youtube-transcript") {
    // Legacy package — accepts either a bare 11-char id or a full URL.
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const items: RawSegmentLegacy[] = await fetchTranscriptLegacy(url);
    return items.map((item) => ({
      text: decodeHtmlEntities(item.text).replace(/\s+/g, " ").trim(),
      offset: item.offset,
      duration: item.duration ?? 0,
    }));
  }

  // youtube-timedtext
  return runTimedTextProvider(videoId);
}

/**
 * Fetch the transcript for a YouTube video.
 *
 * Tries three providers in order:
 *   1. `youtube-transcript-plus` — Innertube + watch page (best for auto-captions)
 *   2. `youtube-transcript`     — older InnerTube path (different bot-detection profile)
 *   3. `youtube-timedtext`      — direct XML endpoint, often works on Vercel where
 *                                 the first two get 429'd from the datacenter IP range
 *
 * Each provider's error is logged with the provider name, video id, message,
 * and stack. We never stop after a single failure unless the error is clearly
 * fatal (bad video id, video genuinely removed). After every provider has
 * failed we throw a {@link TranscriptFetchError} carrying the full attempt
 * history.
 */
export async function fetchTranscript(
  videoId: string
): Promise<TranscriptSegment[]> {
  const providers = [
    "youtube-transcript-plus",
    "youtube-transcript",
    "youtube-timedtext",
  ] as const;

  const attempts: { provider: string; error: unknown }[] = [];

  for (const provider of providers) {
    try {
      return await runProvider(provider, videoId);
    } catch (err) {
      logProviderFailure(provider, videoId, err);
      attempts.push({ provider, error: err });
      if (!isTransientError(err)) break;
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
