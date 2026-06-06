import "server-only";
import OpenAI from "openai";
import type { AiNotes, BreakdownSection, FaqItem, TimelineEntry } from "./types";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY environment variable. Please set it in .env.local."
    );
  }
  const baseURL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  cachedClient = new OpenAI({ apiKey, baseURL });
  return cachedClient;
}

function getModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

const AI_NOTES_SYSTEM_PROMPT = `You are an expert AI Notes generator. Given a video transcript, you will produce comprehensive, deeply detailed notes as a strict JSON object. The output should look like notes from a top AI Notes application (Notion AI, Mem, Reflect, etc.).

OUTPUT RULES (read carefully — your response MUST be valid JSON):
- Return ONLY a single valid JSON object. No commentary, no markdown fences, no preamble, no trailing prose. Your entire response must be parseable as JSON.
- Capture concrete specifics from the transcript: numbers, percentages, marks, scores, dates, names, tools, chapter names, schedules, and direct advice. Do NOT be vague.
- If the speaker addresses a specific audience (Hindi-medium students, beginners, working professionals, etc.), acknowledge that explicitly.
- If the transcript contains non-English content (e.g. Hindi), translate the meaning into clear English.

JSON SCHEMA:
{
  "executiveSummary": "string — exactly 2-3 paragraphs separated by \\n\\n. Paragraph 1: who is speaking, their background/credibility, and why this perspective matters. Paragraph 2: the core thesis/claim with all specific numbers cited. Paragraph 3: the single most important takeaway and the call to action.",
  "keyTakeaways": ["string — 8-12 items. Each is a complete, self-contained, actionable sentence (15-30 words) with specifics."],
  "detailedBreakdown": [
    {
      "heading": "string — clear section heading (e.g. 'Mathematics Strategy', 'The 80/20 Rule', 'Daily Routine')",
      "content": "string — 2-4 sentences explaining this topic. Use natural prose.",
      "subsections": [
        { "heading": "string — subheading if needed", "content": "string — 1-3 sentences" }
      ]
    }
  ],
  "importantFacts": ["string — concrete fact: statistics, scores, dates, percentages, marks. e.g. '80% of the CGL paper consists of repeated questions from previous years.'"],
  "actionItems": ["string — imperative, specific thing the viewer should DO. e.g. 'Take 2 sectional mocks daily for each subject.'"],
  "timeline": [
    { "time": 0, "label": "string — short label for what is discussed at this point in the video (under 8 words)" }
  ],
  "faq": [
    { "question": "string — natural question a viewer might ask", "answer": "string — concise answer (1-3 sentences) drawn from the transcript" }
  ]
}

GUIDANCE:
- "detailedBreakdown" should have 4-8 top-level sections, each capturing a distinct topic from the video. Order them as they appear in the video.
- "importantFacts" should have 6-12 items. Include any specific numbers, percentages, marks, scores, years, or dates mentioned.
- "actionItems" should have 5-10 items. They should be specific, actionable, and ordered roughly by priority or sequence.
- "timeline" should have 8-12 entries spanning the video. Times are in seconds from the start. Pick the most important topic transitions.
- "faq" should have exactly 5 question/answer pairs. Questions should feel natural ("How many hours should I study daily?", "What was the speaker's score in 2025?"). Answers should be direct and factual.
- Preserve the speaker's voice where it adds color, but always translate non-English to English.
- If the transcript is short or lacks detail, do your best with what's available — do not invent specifics that aren't there.`;

function truncateForPrompt(text: string, maxChars = 50_000): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.6));
  const tail = text.slice(-Math.floor(maxChars * 0.4));
  return `${head}\n\n[... middle section of transcript omitted for length ...]\n\n${tail}`;
}

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getClient();
  // We deliberately do NOT pass `response_format: { type: "json_object" }` here
  // because some OpenAI-compatible providers (e.g. DeepSeek) require the literal
  // word "json" in the prompt when json_object is requested, and others ignore
  // or reject the parameter entirely. The system prompt already instructs the
  // model to return ONLY a JSON object, and we have robust JSON coercion in
  // `safeJsonParse` + `coerceNotes` to handle imperfect output.
  const completion = await client.chat.completions.create({
    model: getModel(),
    temperature: 0.3,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const content = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!content) {
    throw new Error(
      `The AI endpoint returned an empty response. Check that OPENAI_BASE_URL (${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}) and OPENAI_MODEL (${getModel()}) are correct, and that OPENAI_API_KEY is valid.`
    );
  }
  return content;
}

function safeJsonParse<T>(text: string, fallback: T): T {
  if (!text) return fallback;

  // 1. Strip markdown ```json ... ``` fences the model sometimes wraps JSON in
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  // 2. Direct parse
  try {
    return JSON.parse(stripped) as T;
  } catch {
    // ignore
  }

  // 3. Find the first JSON object or array
  const match = stripped.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (match) {
    try {
      return JSON.parse(match[1]) as T;
    } catch {
      // ignore
    }
  }

  // 4. Try to repair common LLM JSON issues: trailing commas, single quotes,
  // unescaped newlines inside string values
  const repaired = stripped
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/'/g, '"');
  try {
    return JSON.parse(repaired) as T;
  } catch {
    // ignore
  }

  return fallback;
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return fallback;
  return String(value).trim();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
}

function asBreakdown(value: unknown): BreakdownSection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw): BreakdownSection | null => {
      if (!raw || typeof raw !== "object") return null;
      const obj = raw as Record<string, unknown>;
      const heading = asString(obj.heading);
      const content = asString(obj.content);
      if (!heading || !content) return null;
      const subsections =
        Array.isArray(obj.subsections)
          ? obj.subsections
              .map((sub) => {
                if (!sub || typeof sub !== "object") return null;
                const s = sub as Record<string, unknown>;
                const h = asString(s.heading);
                const c = asString(s.content);
                if (!h || !c) return null;
                return { heading: h, content: c };
              })
              .filter((s): s is { heading: string; content: string } => s !== null)
          : undefined;
      return subsections
        ? { heading, content, subsections }
        : { heading, content };
    })
    .filter((s): s is BreakdownSection => s !== null);
}

function asTimeline(value: unknown): TimelineEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw): TimelineEntry | null => {
      if (!raw || typeof raw !== "object") return null;
      const obj = raw as Record<string, unknown>;
      const time = typeof obj.time === "number" ? obj.time : Number(obj.time);
      const label = asString(obj.label);
      if (!Number.isFinite(time) || !label) return null;
      return { time: Math.max(0, time), display: formatSeconds(time), label };
    })
    .filter((t): t is TimelineEntry => t !== null)
    .sort((a, b) => a.time - b.time);
}

function asFaq(value: unknown): FaqItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw): FaqItem | null => {
      if (!raw || typeof raw !== "object") return null;
      const obj = raw as Record<string, unknown>;
      const question = asString(obj.question);
      const answer = asString(obj.answer);
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter((f): f is FaqItem => f !== null);
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

function emptyNotes(): AiNotes {
  return {
    executiveSummary: "",
    keyTakeaways: [],
    detailedBreakdown: [],
    importantFacts: [],
    actionItems: [],
    timeline: [],
    faq: [],
  };
}

function coerceNotes(raw: unknown): AiNotes {
  if (!raw || typeof raw !== "object") return emptyNotes();
  const obj = raw as Record<string, unknown>;
  return {
    executiveSummary: asString(obj.executiveSummary),
    keyTakeaways: asStringArray(obj.keyTakeaways),
    detailedBreakdown: asBreakdown(obj.detailedBreakdown),
    importantFacts: asStringArray(obj.importantFacts),
    actionItems: asStringArray(obj.actionItems),
    timeline: asTimeline(obj.timeline),
    faq: asFaq(obj.faq),
  };
}

export async function generateAiNotes(transcript: string): Promise<AiNotes> {
  const truncated = truncateForPrompt(transcript, 50_000);
  const text = await callLLM(
    AI_NOTES_SYSTEM_PROMPT,
    `Here is the video transcript. Produce the AI Notes as a single valid JSON object that matches the schema above. Begin your response with the opening brace of the JSON. Pay close attention to ALL specific details — numbers, names, marks, percentages, schedules, chapter names, tools, and direct advice. Do not summarize vaguely.

Transcript:
"""
${truncated}
"""`
  );

  const parsed = safeJsonParse<unknown>(text, null);
  return coerceNotes(parsed);
}

/**
 * Derive a sensible title for the video from the transcript.
 */
export async function generateTitle(transcript: string): Promise<string> {
  const truncated = truncateForPrompt(transcript, 30_000);
  const text = await callLLM(
    "You generate concise, descriptive video titles. Given a transcript, return only the most likely video title in 6-14 words. Do not use quotes, do not add commentary, no preamble. Return plain text only.",
    `Transcript:
"""
${truncated}
"""

Return the title only.`
  );
  return text.replace(/^["']|["']$/g, "").trim() || "YouTube Video";
}
