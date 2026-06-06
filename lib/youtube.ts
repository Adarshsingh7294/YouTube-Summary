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
 * Internal sentinel — thrown by `runSupadataProvider` when
 * `SUPADATA_API_KEY` is not set. The main `fetchTranscript` loop catches
 * this specifically and silently moves on to the next provider instead of
 * logging it as a hard failure (otherwise dev environments without a key
 * would spam the logs with a misleading "Supadata failed" line on every
 * request).
 */
class SupadataNotConfiguredError extends Error {
  constructor() {
    super("SUPADATA_API_KEY is not set");
    this.name = "SupadataNotConfiguredError";
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
 * Provider 0 (primary) — Supadata.ai's hosted transcript API.
 *
 * YouTube tightened bot detection through 2024-2025 and now serves a
 * consent/JS-challenge page to every direct fetch from a datacenter IP
 * (Vercel, AWS Lambda, etc.) — even with full browser headers. The
 * community-maintained transcript libraries and the `timedtext` scrape
 * path stopped working reliably from serverless environments.
 *
 * Supadata runs the actual fetch on residential IPs and exposes a simple
 * REST API. We hit it first; if it's not configured (no key) or fails
 * with a non-transient error, we fall through to the local providers.
 *
 * Docs: https://docs.supadata.ai/youtube
 *   GET https://api.supadata.ai/v1/youtube/transcript?url=<url>&lang=en
 *   Headers: x-api-key: <SUPADATA_API_KEY>
 *
 * Response (200):
 *   { "content": [{ "text": "...", "offset": 0, "duration": 1500 }, ...], "lang": "en" }
 *   Note: Supadata returns `offset` and `duration` in milliseconds.
 */
async function runSupadataProvider(videoId: string): Promise<TranscriptSegment[]> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    // Throw a "skip" signal — the caller detects this exact message and
    // moves on to the next provider without logging it as a hard failure.
    throw new SupadataNotConfiguredError();
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const endpoint = `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(
    videoUrl
  )}&lang=en`;

  console.log(`[transcript:supadata] GET ${endpoint}`);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(
      `Supadata network error: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  if (!res.ok) {
    // Try to pull a useful error message out of the body, but don't crash
    // if the body isn't JSON.
    const body = await res.text().catch(() => "");
    let detail = body.slice(0, 200);
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object") {
        detail =
          (parsed as Record<string, unknown>).message?.toString() ||
          (parsed as Record<string, unknown>).error?.toString() ||
          detail;
      }
    } catch {
      // body wasn't JSON, keep raw text
    }
    throw new Error(
      `Supadata returned HTTP ${res.status} ${res.statusText}: ${detail}`
    );
  }

  const data = (await res.json()) as {
    content?: Array<{ text?: string; offset?: number; duration?: number }>;
    lang?: string;
  };

  if (!data || !Array.isArray(data.content) || data.content.length === 0) {
    throw new Error("Supadata returned an empty transcript");
  }

  console.log(
    `[transcript:supadata] got ${data.content.length} segment(s), lang=${
      data.lang ?? "unknown"
    }`
  );

  return data.content
    .map((item) => {
      const text = (item.text ?? "").toString().replace(/\s+/g, " ").trim();
      // Supadata uses milliseconds — convert to seconds to match our
      // internal segment shape.
      const offsetMs = Number(item.offset);
      const durationMs = Number(item.duration);
      return {
        text,
        offset: Number.isFinite(offsetMs) ? offsetMs / 1000 : 0,
        duration: Number.isFinite(durationMs) ? durationMs / 1000 : 0,
      };
    })
    .filter((s) => s.text.length > 0);
}

/**
 * Realistic Chrome-on-Windows request headers. YouTube's bot detection
 * fingerprints several signals at once — a lone User-Agent isn't enough.
 * We mimic the full set of headers a real browser sends on a watch page
 * navigation so the response includes the full `ytInitialPlayerResponse`
 * (with captionTracks) instead of a consent/bot-check stub.
 */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Sec-Ch-Ua":
    '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "Dnt": "1",
};

/**
 * Provider 1 (primary) — hit YouTube's `timedtext` endpoint directly, but
 * fetch the watch page with full browser headers first so we get a complete
 * `ytInitialPlayerResponse` back even from serverless / datacenter IPs.
 *
 * YouTube serves a stripped-down page (no captionTracks, consent gate) to
 * anything that doesn't look like a real browser. The earlier minimal
 * User-Agent fetch worked locally but failed on Vercel because their IPs
 * are flagged. The full header set below gets us the real page.
 *
 * It only works for videos that have *published* captions. We try English
 * first, then fall back to any available track.
 */
async function runTimedTextProvider(videoId: string): Promise<TranscriptSegment[]> {
  // Step 1 — fetch the watch page with realistic browser headers.
  const playerUrl = `https://www.youtube.com/watch?v=${videoId}&bpctr=9999999999&has_verified=1`;
  console.log(`[transcript:timedtext] GET ${playerUrl}`);
  const watchRes = await fetch(playerUrl, {
    headers: BROWSER_HEADERS,
    cache: "no-store",
    redirect: "follow",
  });

  if (!watchRes.ok) {
    throw new Error(
      `watch page returned HTTP ${watchRes.status} ${watchRes.statusText}`
    );
  }
  const html = await watchRes.text();
  console.log(
    `[transcript:timedtext] watch page: ${html.length} bytes, ` +
      `consent=${/class="consent"/i.test(html)}, ` +
      `hasPlayerResponse=${html.includes("ytInitialPlayerResponse")}`
  );

  // Pull the captionTracks array out of the embedded player response.
  const tracks = extractCaptionTracks(html);
  console.log(
    `[transcript:timedtext] extracted ${tracks.length} caption track(s): ` +
      tracks
        .map((t) => `${t.languageCode}${t.kind ? `(${t.kind})` : ""}`)
        .join(", ") ||
      "(none)"
  );
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

  console.log(
    `[transcript:timedtext] selected track: ${preferred.languageCode}` +
      (preferred.kind ? ` (${preferred.kind})` : "")
  );

  if (!preferred.baseUrl) {
    throw new Error("selected caption track has no baseUrl");
  }

  // Step 2 — fetch the actual caption XML, with browser headers. timedtext
  // is also gated by UA, so we send the same set.
  const captionUrl = preferred.baseUrl.replace(/&fmt=/, "&fmt=srv3");
  console.log(`[transcript:timedtext] GET ${captionUrl.slice(0, 120)}...`);
  const captionRes = await fetch(captionUrl, {
    headers: BROWSER_HEADERS,
    cache: "no-store",
    redirect: "follow",
  });
  if (!captionRes.ok) {
    throw new Error(
      `timedtext returned HTTP ${captionRes.status} ${captionRes.statusText}`
    );
  }
  const xml = await captionRes.text();
  console.log(
    `[transcript:timedtext] caption body: ${xml.length} bytes, ` +
      `hasCues=${/<(p|text)\b/i.test(xml)}`
  );
  if (!xml || !/<(p|text)\b/i.test(xml)) {
    throw new Error("timedtext returned empty or non-XML body");
  }

  const segments = parseCaptionXml(xml);
  console.log(`[transcript:timedtext] parsed ${segments.length} segment(s)`);
  return segments;
}

interface CaptionTrack {
  baseUrl?: string;
  languageCode: string;
  kind?: string; // "asr" = auto-generated
}

function extractCaptionTracks(html: string): CaptionTrack[] {
  // The watch page embeds the player response as
  //   var ytInitialPlayerResponse = { ... };
  // or inside a <script> tag. The captionTracks array can be hundreds of
  // KB into that JSON, so we need to find the start of the object, parse
  // the whole thing, and drill down — walking the string for a balanced
  // array of `captionTracks` is fragile when the JSON contains nested
  // objects with their own arrays.
  const out: CaptionTrack[] = [];

  // First try: the most common case — the player response object is
  // assigned to a top-level variable. Find it and JSON.parse it.
  const playerResponse = findPlayerResponseJson(html);
  if (playerResponse) {
    const tracks = drillForCaptionTracks(playerResponse);
    if (tracks.length > 0) return tracks;
  }

  // Fallback: scan the raw HTML for `"captionTracks":[ ... ]` and walk
  // the array with a bracket counter. This catches the case where the
  // page is partial / broken but the captionTracks block survived.
  const idx = html.indexOf('"captionTracks":');
  if (idx === -1) return out;

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
    const track = normalizeCaptionTrack(item);
    if (track) out.push(track);
  }
  return out;
}

/**
 * Locate the `ytInitialPlayerResponse = { ... }` JSON object in the page
 * and return it as a parsed value. Returns null if not found.
 *
 * YouTube has shipped the assignment in a few forms over the years:
 *   1. `var ytInitialPlayerResponse = {...};`
 *   2. `ytInitialPlayerResponse = {...};`
 *   3. `window["ytInitialPlayerResponse"] = {...};`
 *   4. Inside a `<script>` tag with escaped slashes.
 * We handle them all by finding the opening brace and walking the string
 * to its matching close, then JSON.parsing the slice.
 */
function findPlayerResponseJson(html: string): unknown | null {
  const marker = "ytInitialPlayerResponse";
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  // Find the first `{` after the marker.
  const braceStart = html.indexOf("{", idx);
  if (braceStart === -1) return null;

  // Walk braces to find the matching close. This string can contain
  // escaped quotes inside strings, so we need a real bracket walk that
  // tracks string state.
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;

  const slice = html.slice(braceStart, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

/**
 * Walk an already-parsed player response object looking for the
 * captionTracks array. YouTube has moved this around — sometimes it's at
 *   .captions.playerCaptionsTracklistRenderer.captionTracks
 * and sometimes at
 *   .playerCaptionsTracklistRenderer.captionTracks
 * so we search both paths and also fall back to a deep scan.
 */
function drillForCaptionTracks(root: unknown): CaptionTrack[] {
  const out: CaptionTrack[] = [];
  if (!root || typeof root !== "object") return out;
  const rootObj = root as Record<string, unknown>;

  const candidates: unknown[] = [];

  // Path 1: .captions.playerCaptionsTracklistRenderer.captionTracks
  const captions = rootObj.captions;
  if (captions && typeof captions === "object") {
    const r = (captions as Record<string, unknown>)
      .playerCaptionsTracklistRenderer;
    if (r && typeof r === "object") {
      const arr = (r as Record<string, unknown>).captionTracks;
      if (Array.isArray(arr)) candidates.push(arr);
    }
  }

  // Path 2: .playerCaptionsTracklistRenderer.captionTracks (some embeds)
  if (candidates.length === 0) {
    const r = rootObj.playerCaptionsTracklistRenderer;
    if (r && typeof r === "object") {
      const arr = (r as Record<string, unknown>).captionTracks;
      if (Array.isArray(arr)) candidates.push(arr);
    }
  }

  // Path 3: deep scan — find any array under a `captionTracks` key.
  if (candidates.length === 0) {
    const found = deepFindCaptionTracks(root);
    if (found) candidates.push(found);
  }

  for (const arr of candidates) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const track = normalizeCaptionTrack(item);
      if (track) out.push(track);
    }
  }
  return out;
}

function deepFindCaptionTracks(node: unknown, depth = 0): unknown[] | null {
  if (depth > 8) return null;
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const r = deepFindCaptionTracks(item, depth + 1);
      if (r) return r;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key === "captionTracks" && Array.isArray(obj[key])) {
      return obj[key] as unknown[];
    }
  }
  for (const key of Object.keys(obj)) {
    const r = deepFindCaptionTracks(obj[key], depth + 1);
    if (r) return r;
  }
  return null;
}

function normalizeCaptionTrack(item: unknown): CaptionTrack | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  const baseUrl =
    typeof obj.baseUrl === "string"
      ? obj.baseUrl
      : typeof obj.url === "string"
      ? obj.url
      : undefined;
  const languageCode =
    typeof obj.languageCode === "string" ? obj.languageCode : "";
  if (!baseUrl || !languageCode) return null;
  return {
    baseUrl,
    languageCode,
    kind: typeof obj.kind === "string" ? obj.kind : undefined,
  };
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
    | "supadata"
    | "youtube-transcript-plus"
    | "youtube-transcript"
    | "youtube-timedtext",
  videoId: string
): Promise<TranscriptSegment[]> {
  if (provider === "supadata") {
    return runSupadataProvider(videoId);
  }

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
 * Tries providers in order:
 *   1. `supadata`              — Supadata.ai hosted API (requires
 *                                 SUPADATA_API_KEY). Most reliable on Vercel.
 *                                 Skipped automatically if the key is unset.
 *   2. `youtube-timedtext`      — direct watch page + XML endpoint with full
 *                                 browser headers. Kept as a fallback for
 *                                 local dev where Supadata isn't configured.
 *   3. `youtube-transcript-plus` — InnerTube + watch page (best for auto-captions
 *                                 on videos with no published track)
 *   4. `youtube-transcript`     — older InnerTube path (last-ditch fallback)
 *
 * Each provider's error is logged with the provider name, video id, message,
 * and stack. We never stop after a single failure unless the error is clearly
 * fatal (bad video id, video genuinely removed, or Supadata not configured).
 * After every provider has failed we throw a {@link TranscriptFetchError}
 * carrying the full attempt history.
 */
export async function fetchTranscript(
  videoId: string
): Promise<TranscriptSegment[]> {
  const providers = [
    "supadata",
    "youtube-timedtext",
    "youtube-transcript-plus",
    "youtube-transcript",
  ] as const;

  const attempts: { provider: string; error: unknown }[] = [];

  for (const provider of providers) {
    const startedAt = Date.now();
    console.log(`[transcript] trying provider "${provider}" for ${videoId}`);
    try {
      const segments = await runProvider(provider, videoId);
      const ms = Date.now() - startedAt;
      console.log(
        `[transcript] provider "${provider}" succeeded for ${videoId} ` +
          `(${segments.length} segments in ${ms}ms)`
      );
      return segments;
    } catch (err) {
      const ms = Date.now() - startedAt;

      // Special case: Supadata isn't configured. Skip silently and try
      // the next provider — this is an expected state in dev, not a
      // failure worth logging.
      if (err instanceof SupadataNotConfiguredError) {
        console.log(
          `[transcript] provider "${provider}" skipped (not configured) for ${videoId}`
        );
        continue;
      }

      logProviderFailure(provider, videoId, err);
      console.error(
        `[transcript] provider "${provider}" failed for ${videoId} after ${ms}ms`
      );
      attempts.push({ provider, error: err });

      // Skip the rest of the chain without trying the other providers
      // when the error is clearly not transient.
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
