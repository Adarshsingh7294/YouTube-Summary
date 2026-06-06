import { NextRequest, NextResponse } from "next/server";
import {
  buildTimestamps,
  extractVideoId,
  fetchTranscript,
  transcriptToText,
} from "@/lib/youtube";
import { generateAiNotes, generateTitle } from "@/lib/summarize";
import type { SummaryResponse, TimelineEntry } from "@/lib/types";

export const runtime = "nodejs";
// Allow up to 5 minutes for the whole pipeline
export const maxDuration = 300;

interface RequestBody {
  url?: string;
}

function formatSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body." },
      { status: 400 }
    );
  }

  const url = (body?.url ?? "").toString().trim();
  if (!url) {
    return NextResponse.json(
      { error: "Please provide a YouTube URL." },
      { status: 400 }
    );
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json(
      {
        error:
          "That doesn't look like a valid YouTube URL. Try a link like https://www.youtube.com/watch?v=... or https://youtu.be/...",
      },
      { status: 400 }
    );
  }

  try {
    const segments = await fetchTranscript(videoId);
    if (!segments || segments.length === 0) {
      return NextResponse.json(
        {
          error:
            "No transcript is available for this video. The video may be private, age-restricted, or have captions disabled.",
        },
        { status: 404 }
      );
    }

    const transcriptText = transcriptToText(segments);
    if (!transcriptText) {
      return NextResponse.json(
        { error: "The transcript was empty, so there's nothing to summarize." },
        { status: 400 }
      );
    }

    // Generate AI Notes + title sequentially to respect free-tier rate limits.
    const notes = await generateAiNotes(transcriptText);
    const title = await generateTitle(transcriptText);

    // Build a fallback timeline from the AI's timeline; if it's empty, derive
    // one from the transcript segments.
    let timeline: TimelineEntry[] = notes.timeline;
    if (timeline.length === 0) {
      const derived = buildTimestamps(segments);
      timeline = derived.map((t) => ({
        time: t.time,
        display: t.display,
        label: t.text,
      }));
    } else {
      // Make sure every timeline entry has a display string
      timeline = timeline.map((t) => ({
        ...t,
        display: t.display || formatSeconds(t.time),
      }));
    }

    const response: SummaryResponse = {
      ...notes,
      timeline,
      title,
      videoId,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error while summarizing.";

    if (/Missing OPENAI_API_KEY/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "The server is missing an OpenAI API key. Set OPENAI_API_KEY in your .env.local file.",
        },
        { status: 500 }
      );
    }
    if (/Could not retrieve a transcript|Transcript is disabled|fetchTranscript/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "We couldn't fetch a transcript for this video. It may be private, region-restricted, or have captions disabled.",
        },
        { status: 404 }
      );
    }

    const looksLikeHtml =
      /^\s*<!doctype html/i.test(message) || /^\s*<html/i.test(message);
    if (looksLikeHtml) {
      return NextResponse.json(
        {
          error:
            "The AI endpoint returned an HTML page instead of JSON. This usually means OPENAI_BASE_URL is wrong or the model is not supported on that provider. Check your .env.local.",
        },
        { status: 502 }
      );
    }

    console.error("[/api/summarize] error:", err);
    return NextResponse.json(
      { error: `Something went wrong: ${message}` },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Use POST with a JSON body of { url: string }." },
    { status: 405 }
  );
}
