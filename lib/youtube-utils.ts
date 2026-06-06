/**
 * Client-safe YouTube URL and timestamp utilities.
 * No external dependencies — safe to import from client components.
 */

/**
 * Extract the YouTube video ID from a variety of YouTube URL formats.
 * Supports:
 *  - https://www.youtube.com/watch?v=ID
 *  - https://youtube.com/watch?v=ID
 *  - https://youtu.be/ID
 *  - https://www.youtube.com/shorts/ID
 *  - https://www.youtube.com/embed/ID
 *  - https://m.youtube.com/watch?v=ID
 *  - bare 11-char ID
 */
export function extractVideoId(url: string): string | null {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();

  // Bare video id (11 chars, alphanumeric + dash + underscore)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");

  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0];
    return isValidVideoId(id) ? id : null;
  }

  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    const v = parsed.searchParams.get("v");
    if (v && isValidVideoId(v)) return v;

    const parts = parsed.pathname.split("/").filter(Boolean);
    // /shorts/ID, /embed/ID, /live/ID, /v/ID
    const idx = parts.findIndex(
      (p) => p === "shorts" || p === "embed" || p === "v" || p === "live"
    );
    if (idx !== -1 && parts[idx + 1] && isValidVideoId(parts[idx + 1])) {
      return parts[idx + 1];
    }
  }

  return null;
}

function isValidVideoId(id: string | null | undefined): id is string {
  return !!id && /^[a-zA-Z0-9_-]{11}$/.test(id);
}

/**
 * Format a number of seconds as HH:MM:SS or MM:SS.
 */
export function formatTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(minutes)}:${pad(secs)}`;
}
