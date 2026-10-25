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


/**
 * A publisher is not its article: translating an article never translates the
 * attribution. Use the verified English names of the configured publications,
 * retaining the Chinese label on the Chinese edition. Never disguise distinct
 * Chinese outlets as the same anonymous "Publisher".
 *
 * All Chinese names in industry/sources.json must have an entry here. For a
 * source created later in the admin, use its actual original URL hostname until
 * an authoritative English name is configured.
 */
export const EN_SOURCE_NAMES: Record<string, string> = {
  "Federal Reserve 新闻公告": "Federal Reserve · Press Releases",
  "SEC 新闻公告": "U.S. SEC · Press Releases",
  "BIS 新闻公告": "BIS · Press Releases",
  "BIS 研究论文": "BIS · Research Papers",
  "Google AI 官方博客": "Google AI · Official Blog",
  "国家统计局 · 数据发布": "National Bureau of Statistics of China · Data Releases",
  "中国新闻网 · 财经": "China News Service · Finance",
  "中国新闻网 · 时政": "China News Service · China",
  "中国新闻网 · 国际": "China News Service · World",
  "中国新闻网 · 粤港澳大湾区": "China News Service · Greater Bay Area",
  "量子位 · AI 产业与研究": "QbitAI · AI Industry & Research",
  "IT之家 · 科技动态": "ITHome · Technology",
  "香港金融管理局 · 新闻稿": "Hong Kong Monetary Authority · Press Releases",
  "PANews · 中文文章": "PANews · Articles",
  "PANews · 中文快讯": "PANews · News Flashes",
  "中国人民银行 · 交流资讯": "People's Bank of China · News & Communications",
  "中国证监会 · 发布公告": "China Securities Regulatory Commission · Announcements",
  "工业和信息化部 · 工作动态": "Ministry of Industry and Information Technology · Updates",
};

export function englishSourceName(name: string, originalUrl?: string | null): string {
  const normalized = name.replace(/\\s+/g, " ").trim();
  if (!hasHan(normalized)) return normalized || "Source";
  const known = EN_SOURCE_NAMES[normalized];
  if (known) return known;
  // Source attribution must stay specific even if an operator introduces a
  // Chinese-only source not yet in the verified name registry.
  if (originalUrl) {
    try {
      const parsed = new URL(originalUrl);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        const host = parsed.hostname.replace(/^www\\./, "");
        if (host && !hasHan(host)) return host;
      }
    } catch { /* Do not derive a name from malformed source URLs. */ }
  }
  return "Untranslated source";
}

export function localizedSourceName(name: string, language: "en" | "zh", originalUrl?: string | null): string {
  return language === "en" ? englishSourceName(name, originalUrl) : name;
}
