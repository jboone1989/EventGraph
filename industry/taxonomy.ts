// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类（教程、观点）：日报写过的事又有评论类的后续报道，只占一行快讯（报道它的信源够多时除外）。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 * feedLabel 是分类 RSS 标题里的名字（不写就用 label）。公开接口、RSS 和 MCP 里要把一类并进另一类发布，写在站点设置里（site/site.ts 的 PUBLIC_CATEGORIES）。
 */
export const CATEGORIES = [
  { key: "ai", label: "AI", feedLabel: "AI 动态", section: "人工智能", sectionEn: "AI", guide: "AI 模型、应用、算力、基础设施、研究和产业变化。" },
  { key: "crypto", label: "加密货币", feedLabel: "加密市场", section: "加密货币", sectionEn: "Crypto", guide: "比特币、区块链、稳定币、交易所、链上金融、数字资产监管与市场结构。" },
  { key: "finance", label: "金融", feedLabel: "金融市场", section: "金融与宏观", sectionEn: "Finance & macro", guide: "货币政策、利率、流动性、资本市场、金融机构、ETF 与金融科技。" },
  { key: "world", label: "全球事件", feedLabel: "国际与地缘", section: "全球政治与产业", sectionEn: "Global & industry", guide: "影响金融市场、供应链、能源、贸易或技术产业的重大国际政治、军事和产业事件。排除与市场及技术关系不明的泛社会热点。" },
  { key: "research", label: "深度研究", feedLabel: "原创研究与解释", section: "独立研究", sectionEn: "Independent research", guide: "有独立分析、可核验的方法、数据比较、实测或可迁移的系统解释；任何作者均可归此类。单纯转述新闻不应归此类。" },
] as const satisfies ReadonlyArray<{ key: string; label: string; feedLabel?: string; section: string; sectionEn: string; guide: string; commentary?: true }>;

/** 日报版面标题的英文说法，按 section 中文名查；没写的行业在英文页面回退成“Section N”。 */
export const SECTION_EN: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.section, c.sectionEn]));

/**
 * 这个行业最受关注的一类发布（AI 行业是新模型）：日报报头的“N 个新模型”、改分类后修订已出的报告都按它数。
 * category 是类别，tag 是标签，两者都对上才算；unit 接在数字后面。
 * 没有这样一类的行业设成 null，报头就不显示这个数。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = null;

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写）。站名会自动算进去。 */
export const PLAIN_TERMS: readonly string[] = ["ai", "api", "llm", "agent", "agents", "mcp", "btc", "eth", "etf", "defi"];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["model_release", "product_launch", "tool_or_prompt", "research_paper", "industry_event", "opinion_analysis", "tutorial_explainer"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = ["新闻动态", "原创研究", "深度解读", "数据分析", "实用教程", "产品发布", "政策监管", "观点评论", "其他"] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = ["大模型", "AI Agent", "算力与芯片", "AI 应用", "AI 成本", "开源技术", "比特币", "以太坊", "稳定币", "DeFi", "链上数据", "交易平台", "ETF", "利率债券", "宏观流动性", "金融科技", "市场结构", "监管政策", "地缘政治", "能源与大宗商品", "半导体产业", "宏观数据"] as const;

/** 可选的实体标签（公司、机构、平台）。 */
export const ENTITY_TAGS = ["OpenAI", "Anthropic", "DeepSeek", "Google", "Meta", "Microsoft", "NVIDIA", "xAI", "Hugging Face", "GitHub", "arXiv", "Bitcoin", "Ethereum", "Federal Reserve", "SEC"] as const;

/** 模型常写的近义词，统一成词表里的写法（按小写匹配）。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  news: "新闻动态", release: "产品发布", launch: "产品发布",
  research: "数据分析", paper: "数据分析", study: "数据分析",
  analysis: "深度解读", explainer: "深度解读", essay: "观点评论",
  guide: "实用教程", tutorial: "实用教程", howto: "实用教程",
  benchmark: "数据分析", data: "数据分析", policy: "政策监管", regulation: "政策监管",
  agent: "AI Agent", agents: "AI Agent", llm: "大模型", gpu: "算力与芯片",
  bitcoin: "比特币", btc: "比特币", ethereum: "以太坊", eth: "以太坊",
  stablecoin: "稳定币", stablecoins: "稳定币", defi: "DeFi", etf: "ETF",
  "federal reserve": "Federal Reserve", "the fed": "Federal Reserve", sec: "SEC",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * aliases 给结构抽取模型看；otherNames 是公司自己的其他称呼（官方账号名、子品牌），
 * 把事实的主体对到发布方时也认它们。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; otherNames?: string[] }> = {
  "world-labs": { name: "World Labs", displayTag: null, aliases: ["World Labs"] },
  "thinking-machines": { name: "Thinking Machines Lab", displayTag: null, aliases: ["Thinking Machines"] },
  amd: { name: "AMD", displayTag: null, aliases: ["AMD", "Advanced Micro Devices"] },
  openai: { name: "OpenAI", displayTag: "OpenAI", aliases: ["OpenAI", "ChatGPT", "Sora", "Codex", "GPT"], otherNames: ["OpenAI Developers"] },
  anthropic: { name: "Anthropic", displayTag: "Anthropic", aliases: ["Anthropic", "Claude"], otherNames: ["Claude Code"] },
  google: { name: "Google", displayTag: "Google", aliases: ["Google", "DeepMind", "Gemini", "谷歌"], otherNames: ["Google DeepMind", "Google Research", "Google AI", "Google Labs", "Google Cloud"] },
  deepseek: { name: "DeepSeek", displayTag: "DeepSeek", aliases: ["DeepSeek", "深度求索"] },
  qwen: { name: "千问 Qwen", displayTag: null, aliases: ["Qwen", "通义", "阿里"], otherNames: ["通义千问", "千问", "千问APP", "Qwen Team", "通义实验室", "阿里巴巴", "Alibaba", "阿里云", "Alibaba Cloud"] },
  kimi: { name: "Kimi / 月之暗面", displayTag: null, aliases: ["Kimi", "月之暗面", "Moonshot"], otherNames: ["Moonshot AI"] },
  minimax: { name: "MiniMax", displayTag: null, aliases: ["MiniMax", "海螺"], otherNames: ["稀宇科技"] },
  zhipu: { name: "智谱 GLM", displayTag: null, aliases: ["智谱", "GLM", "Z.ai"], otherNames: ["智谱AI", "Zhipu", "Zhipu AI"] },
  xai: { name: "xAI", displayTag: "xAI", aliases: ["xAI", "Grok"], otherNames: ["SpaceXAI"] },
  meta: { name: "Meta", displayTag: "Meta", aliases: ["Meta", "Llama"], otherNames: ["Meta AI", "AI at Meta"] },
  microsoft: { name: "Microsoft", displayTag: "Microsoft", aliases: ["Microsoft", "微软", "Copilot"], otherNames: ["Microsoft Research", "Microsoft AI"] },
  nvidia: { name: "NVIDIA", displayTag: null, aliases: ["NVIDIA", "英伟达"] },
  "hugging-face": { name: "Hugging Face", displayTag: "Hugging Face", aliases: ["Hugging Face"], otherNames: ["HuggingFace"] },
  cursor: { name: "Cursor", displayTag: null, aliases: ["Cursor", "Anysphere"] },
  openrouter: { name: "OpenRouter", displayTag: null, aliases: ["OpenRouter"] },
  bitcoin: { name: "Bitcoin", displayTag: "Bitcoin", aliases: ["Bitcoin", "BTC", "比特币"] },
  ethereum: { name: "Ethereum", displayTag: "Ethereum", aliases: ["Ethereum", "ETH", "以太坊"] },
  "federal-reserve": { name: "Federal Reserve", displayTag: "Federal Reserve", aliases: ["Federal Reserve", "Fed", "美联储", "FOMC"] },
  sec: { name: "SEC", displayTag: "SEC", aliases: ["U.S. Securities and Exchange Commission", "SEC", "美国证券交易委员会"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "openai", name: "OpenAI", patterns: [/openai|chatgpt|\bgpt-?[o\d]|\bsora\b|\bcodex\b/i] },
  { id: "anthropic", name: "Anthropic", patterns: [/anthropic|\bclaude\b/i, /\b(?:opus|sonnet|haiku)\s*\d+(?:[.\-]\d+)*\b/i, /\bfable\s*\d+(?:[.\-]\d+)*\b|\bmythos\b/i] },
  { id: "google", name: "Google / Gemini", patterns: [/google|deepmind|\bgemini\b|notebooklm|\bveo\s?\d|\bAlphaFold\b|\bAMIE\b/i] },
  { id: "deepseek", name: "DeepSeek", patterns: [/deepseek|深度求索/i] },
  { id: "xai", name: "xAI / Grok", patterns: [/\bxai\b|\bgrok\b/i] },
  { id: "meta", name: "Meta / Llama", patterns: [/\bMeta\b/, /\bmeta\s?ai\b|\bllama\b/i] },
  { id: "microsoft", name: "Microsoft / Copilot", patterns: [/microsoft|copilot|微软/i] },
  { id: "nvidia", name: "NVIDIA", patterns: [/nvidia|英伟达|\bnemotron\b|\bnemo\b|\bblackwell\b|\brubin(?:\s+ultra)?\b|\bcuda\b/i] },
  { id: "qwen", name: "千问 Qwen", patterns: [/\bqwen|通义|千问/i] },
  { id: "hugging-face", name: "Hugging Face", patterns: [/hugging\s?face/i] },
  { id: "cursor", name: "Cursor", patterns: [/\bCursor\b/] },
  { id: "kimi", name: "Kimi / 月之暗面", patterns: [/\bkimi\b|月之暗面|\bmoonshot\s?ai\b/i] },
  { id: "openrouter", name: "OpenRouter", patterns: [/openrouter/i] },
  { id: "bitcoin", name: "Bitcoin", patterns: [/\\bbitcoin\\b|\\bbtc\\b|比特币/i] },
  { id: "ethereum", name: "Ethereum", patterns: [/\\bethereum\\b|\\beth\\b|以太坊/i] },
  { id: "federal-reserve", name: "Federal Reserve", patterns: [/federal reserve|\\bfomc\\b|美联储/i] },
  { id: "sec", name: "SEC", patterns: [/\\bsec\\b|securities and exchange commission|美国证券交易委员会/i] },
  { id: "minimax", name: "MiniMax", patterns: [/minimax/i] },
  { id: "zhipu", name: "智谱 GLM", patterns: [/智谱|\bglm-?[4-9]/i] },
  { id: "hunyuan", name: "腾讯混元", patterns: [/混元|hunyuan/i] },
  { id: "doubao", name: "字节豆包", patterns: [/豆包|doubao|字节跳动|bytedance/i] },
  { id: "mistral", name: "Mistral", patterns: [/mistral/i] },
  { id: "perplexity", name: "Perplexity", patterns: [/\bPerplexity\b/] },
  { id: "runway", name: "Runway", patterns: [/\brunway\b/i] },
  { id: "suno", name: "Suno", patterns: [/\bsuno\b/i] },
  { id: "midjourney", name: "Midjourney", patterns: [/midjourney/i] },
  { id: "stability-ai", name: "Stability AI", patterns: [/stability\s?ai/i] },
  { id: "elevenlabs", name: "ElevenLabs", patterns: [/eleven\s?labs/i] },
  { id: "vllm", name: "vLLM", patterns: [/\bvllm\b/i] },
  { id: "ollama", name: "Ollama", patterns: [/\bollama\b/i] },
  { id: "windsurf", name: "Windsurf", patterns: [/windsurf/i] },
  { id: "devin", name: "Devin", patterns: [/\bdevin\b/i] },
  { id: "manus", name: "Manus", patterns: [/\bmanus\b/i] },
  { id: "apple", name: "Apple AI", patterns: [/\bapple\s?(intelligence|silicon|ai)\b|苹果(智能|\s?AI)/i] },
  { id: "amazon", name: "Amazon / AWS", patterns: [/amazon|\baws\b|亚马逊/i] },
  { id: "baidu", name: "百度文心", patterns: [/百度|baidu|文心|\bernie\s?bot\b/i] },
];

/** 这些域名上的文章，发布方就是对应的公司（托管平台如 GitHub、arXiv 不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "openai", domains: ["openai.com"] },
  { entityId: "anthropic", domains: ["anthropic.com", "claude.com"] },
  { entityId: "google", domains: ["deepmind.google", "ai.google", "blog.google"] },
  { entityId: "deepseek", domains: ["deepseek.com"] },
  { entityId: "xai", domains: ["x.ai"] },
  { entityId: "meta", domains: ["ai.meta.com"] },
  { entityId: "microsoft", domains: ["microsoft.com"] },
  { entityId: "nvidia", domains: ["nvidia.com"] },
  { entityId: "qwen", domains: ["qwen.ai"] },
  { entityId: "cursor", domains: ["cursor.com"] },
  { entityId: "openrouter", domains: ["openrouter.ai"] },
  { entityId: "federal-reserve", domains: ["federalreserve.gov"] },
  { entityId: "sec", domains: ["sec.gov"] },
];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "meta", pattern: /@AIatMeta\b/i },
  { entityId: "zhipu", pattern: /\bZhipu(?:\s+AI\b|['’]s\b)/i },
];
