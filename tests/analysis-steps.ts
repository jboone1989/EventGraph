// Which step of the article analysis a model request is for, and a score that selects. Each step sends
// its own system prompt, rendered from the industry pack, and the thresholds come from the pack too: a
// test that recognises a request by its whole prompt and scores against the pack's threshold keeps
// working when a site rewrites the prompts and recalibrates the thresholds for its own industry.
import { ANALYZE_ONCE_SYSTEM, MEND_SYSTEM, SCORE_SYSTEM, STRUCTURE_SYSTEM, tierThreshold } from "@aihot/backend/editorial/analyze";
import { PREFILTER_SYSTEM, UNDERSTAND_SYSTEM } from "@aihot/backend/editorial/writing";

export type AnalysisStep = "combined" | "prefilter" | "score" | "structure" | "understand" | "summarize" | "wording";

const BY_SYSTEM = new Map<string, AnalysisStep>([
  [ANALYZE_ONCE_SYSTEM, "combined"], [PREFILTER_SYSTEM, "prefilter"], [SCORE_SYSTEM, "score"], [STRUCTURE_SYSTEM, "structure"], [UNDERSTAND_SYSTEM, "understand"], [MEND_SYSTEM, "wording"],
]);

/** The step of a chat request, from its body as the provider receives it; the title/summary prompt comes without a system message. */
export function analysisStep(body: string): AnalysisStep {
  const { messages } = JSON.parse(body) as { messages: Array<{ role: string; content: unknown }> };
  if (messages[0]?.role !== "system") return "summarize";
  const step = BY_SYSTEM.get(String(messages[0].content));
  if (!step) throw new Error(`not a request of the article analysis: ${String(messages[0].content).slice(0, 80)}`);
  return step;
}

/**
 * Both score calls at the T1_5 threshold: material from a T1_5 source is selected, with this mean score, and
 * so is material from a T1 source (this site's T1 threshold is lower: Ferro's own work).
 */
export const SELECTING_SCORE = tierThreshold("T1_5")!;

/** A complete one-pass provider response for concurrency and retry integration tests. */
export function combinedAnswer(overrides: Record<string, unknown> = {}) {
  return {
    label: "PASS", reason: "confirmed news", attentionScore: SELECTING_SCORE,
    scope: "single", category: "ai", tags: ["模型发布"], subjects: [], fact: null,
    titleZh: "实验室发布新模型", summaryZh: "实验室发布了新模型，公布了性能评测结果以及价格。",
    titleEn: "A laboratory releases a new AI model",
    summaryEn: "A laboratory has launched a new AI model and published benchmark results and pricing details.",
    reasonZh: "模型发布具备新闻价值", itemType: "model_release", authorRole: "principal",
    ...overrides,
  };
}
