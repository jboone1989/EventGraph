// 编辑手记：运营者按日出刊时写在日报最前面的几小段话（specs/003-content-assets FR-004）。
// 键是日报日期（北京时间 YYYY-MM-DD），与 `/daily/<date>` 一一对应；某天没写就不显示，不留占位。
// 手记是人写的编辑判断，不参与模型生成，也不进 RSS/Agent 出口。
export interface EditorNote {
  /** 中文手记，2–4 句：今天最值得注意的事、哪里还需要核实。 */
  note: string;
  /** 英文手记（选填）：英文日报只显示它，不把中文当英文。 */
  noteEn?: string;
}

export const EDITOR_NOTES: Record<string, EditorNote> = {
  "2026-10-24": {
    note: "今天起，日报最前面多了一小块「编辑手记」：每天用几句话说明今天最值得注意的事，以及哪些说法还需要回原文核对。手记由人写，模型不参与；写错会在页面上更正，不会悄悄改掉。",
    noteEn: "Starting today, the daily opens with a short editor's note: what is worth watching today, and which claims still need checking against the original reporting. The note is written by a person, not the model; when we get something wrong, the page records the correction.",
  },
};
