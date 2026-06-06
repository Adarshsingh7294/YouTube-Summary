"use client";

import type { SummaryResponse } from "@/lib/types";
import AiNotesView from "./AiNotesView";

export default function SummaryDisplay({ summary }: { summary: SummaryResponse }) {
  return <AiNotesView summary={summary} />;
}
