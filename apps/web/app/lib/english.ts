import type { TopicSummary } from "@aihot/contracts/site";

/** Source-derived English display copy: never present a Chinese editorial abstract as English. */
export const hasHan = (value: string) => new RegExp("[\\u3400-\\u9fff]", "u").test(value);

export function englishText(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return hasHan(value) ? null : value.trim();
}

/** The string as-is when it already reads in English, else null. */
export const englishOnly = (s: string | null | undefined) => s && !hasHan(s) ? s : null;

const TOPICS: Record<string,[string,string]>={
"ai-models":["AI Models & Applications","Models, capabilities and applications"],"ai-infrastructure":["AI Infrastructure","Compute, chips and AI economics"],"ai-agents":["AI Agents","Agent systems and automation"],
bitcoin:["Bitcoin","The Bitcoin ecosystem, ETFs and markets"],stablecoins:["Stablecoins & Payments","Issuance, settlement and regulation"],onchain:["On-chain Finance","DeFi and on-chain market structure"],
macro:["Rates & Liquidity","Monetary policy, bonds and capital flows"],etf:["ETFs & Markets","Capital markets and fund flows"],regulation:["Policy & Regulation","Financial, AI and crypto oversight"],
"original-research":["Original Research","Independent experiments and analysis"],explainers:["Deep Dives","Explaining how systems work"],"data-analysis":["Data Analysis","Data, indicators and methods"],"practical-guides":["Practical Guides","Reusable workflows and tutorials"],
openai:["OpenAI","OpenAI research and product updates"],anthropic:["Anthropic","Anthropic research and product updates"],google:["Google / DeepMind","Models, research and announcements"],meta:["Meta","AI and technology developments"],
nvidia:["NVIDIA","AI infrastructure and semiconductor technology"],"hugging-face":["Hugging Face","Open-source AI research"],ethereum:["Ethereum","Network changes and ecosystem activity"],
"federal-reserve":["Federal Reserve","Monetary policy and rates"],sec:["U.S. SEC","Securities policy and regulation"],geopolitics:["Geopolitics & Markets","Sanctions, trade and conflict"],energy:["Energy & Commodities","Energy supply and commodities"],semiconductor:["Semiconductors","Supply chains and chip production"],"macro-releases":["Economic Data","Official inflation, jobs and GDP reports"]};

export const enTopicName=(t:Pick<TopicSummary,"slug"|"name">)=>TOPICS[t.slug]?.[0]??englishOnly(t.name);
export const enTopic=(t:Pick<TopicSummary,"slug"|"name">)=>enTopicName(t)??"Research topic";
export const enDescription=(t:Pick<TopicSummary,"slug"|"definition">)=>TOPICS[t.slug]?.[1]??englishOnly(t.definition)??"Original reports and research";

/** 主题目录分组在英文版的标题与一句话说明，按分组 key；映射之外（站点自加的分组）英文页回退到没有汉字的名字，再没有就省略。 */
export const EN_TOPIC_GROUPS: Record<string,[string,string]>={
  field:["Explore by field","Technology, finance and markets"],
  genre:["Research & explainers","Methods, analysis and tutorials"],
  company:["Organizations","Company releases and institutional updates"],
};
