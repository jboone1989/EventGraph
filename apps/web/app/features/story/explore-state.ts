import type { StoryDetail } from "@aihot/contracts/site";
import { buildReplayFrames } from "./replay.ts";

export type ExplorerClock = "known" | "valid";

export interface ExplorerTimeState {
  clock: ExplorerClock;
  position: number;
  asOf: string | null;
}

/** Deep-link time state for the standalone explorer: /explore?story=…&clock=…&asOf=….
 *  Unknown values fall back to the default view instead of failing the page; the as-of
 *  cutoff selects the last replay frame at or before it, like the clock switch does. */
export function explorerTimeState(params: URLSearchParams, timeline: StoryDetail["timeline"]): ExplorerTimeState {
  const clock: ExplorerClock = params.get("clock") === "valid" ? "valid" : "known";
  const frames = buildReplayFrames(timeline, clock === "known" ? "known" : "published");
  if (!frames.length) return { clock, position: 0, asOf: null };
  const requested = Date.parse(params.get("asOf") ?? "");
  const position = Number.isFinite(requested)
    ? Math.max(0, frames.findLastIndex((frame) => Date.parse(frame.publishedAt) <= requested))
    : frames.length - 1;
  return { clock, position, asOf: frames[position]!.publishedAt };
}
