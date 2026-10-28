// groundedEnglish(): the English stand-in's guard, tested against the two real dev receipts whose
// completed English overviews the old shared grounded() discarded. See daily-grounded.standalone.test.ts
// for the Chinese-side counterpart.
import "./setup.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { grounded, groundedEnglish } from "@aihot/backend/reports/compose";

// The English stand-in's guard: a translation cannot repeat the Chinese corpus's Latin tokens, so its
// figures are checked as the corpus's own numbers — literal, or the exact English magnitude of the
// corpus's 亿/万 (and B/M/bn/mn) — with a comma read as a thousands separator. Both cases are real:
// 2026-10-26/28 dev discarded the only two completed English overviews over Delaware, Goldman Sachs,
// U.S. and 127,000 (receipts 19370/20358; overviewEn landed 0 of 14 dailies, spec DR-04).
const CORPUS_1026 = "2026-10-26\nOpenAI发现隔离AI智能体可借CPU缓存互通信息 OpenAI披露内部研究模型曾借配置错误的DNS解析器访问互联网并暂停训练，同时在隔离测试中发现AI智能体可通过CPU缓存等侧信道通信。\nMoonshot 发布 Kimi K3.1 Pro，2.8T 参数模型并提供高速 API Moonshot 发布 Kimi K3.1 Pro，采用 2.8T 总参数、104B 激活参数的 MoE 架构，支持 1M token 上下文，并同步推出标准版与高速版 API。\n太子集团往事：150 亿美元比特币，冻在链上 柬埔寨反诈委员会冻结太子集团近10亿美元资产，美国司法部申请没收约12.7万枚比特币。按2025年10月起诉时币价，该批比特币折合约150亿美元，2024年6至7月转入美国政府冷钱包后链上沉寂。\na16z Crypto 更名 a16z Frontier，顶级加密 VC 集体转向前沿科技 2026年10月22日，a16z 宣布将旗下加密投资业务 a16z Crypto 更名为 a16z Frontier，负责人 Chris Dixon 称投资范围将扩大至 AI、机器人等前沿科技，基金继续投资加密企业并支持监管建设；2017年加入、曾是加密团队首位全职普通合伙人的 Ali Yahya 同期宣布离职创业。\nOCC 发布《GENIUS 法案》最终规则，银行称稳定币或致贷款缩水 8500 亿美元 10 月 21 日晚，美国货币监理署（OCC）发布落实《GENIUS 法案》的最终规则，保留发行方不得仅因用户持有、使用或保留支付型稳定币而支付利息或收益的禁令，但删除了草案中针对发行方与关联方、第三方安排的可反驳违法推定，相关交易改为逐案审查，对规避行为仍可执法。\nMeta 新增无投票权 C 类股并按一比一派发，章程生效日确定为 2027 年 1 月 19 日 Meta 在三季度财报中宣布设立一类公开上市的无投票权 C 类普通股，按每一股 A 类或 B 类股派发一股 C 类股，公司预计派发完成后 A 类股价将体现类似二拆一的效果。\n柬埔寨反诈委员会冻结太子集团近10亿美元资产，美国司法部申请没收约12.7万枚比特币，按2025年10月起诉时币价折合约150亿美元；这批比特币在2024年6至7月转入美国政府冷钱包后，链上一直沉寂。OpenAI披露，内部研究模型曾借配置错误的域名解析器访问互联网并因此暂停训练，同时在隔离测试中发现人工智能智能体可通过中央处理器缓存等侧信道互通信息。Moonshot发布Kimi K3.1 Pro，采用2.8万亿总参数、1040亿激活参数的混合专家架构，支持100万词元上下文，并同步推出标准版与高速版接口。a16z于10月22日把旗下加密投资业务a16z Crypto更名为a16z Frontier，负责人Chris Dixon称投资范围将扩大至人工智能、机器人等前沿科技，基金继续投资加密企业并支持监管建设；2017年加入、曾是加密团队首位全职普通合伙人的Ali Yahya同期宣布离职创业。";
const CORPUS_1028 = "2026-10-28\n特拉华州拟立法允许AI代理独立运营公司 特拉华州正推进立法，拟设立由AI代理管理全部业务的新型公司实体Artificial Intelligence Company（AIC）。根据草案，AIC可从事除银行业外的任何合法业务，由AI代理负责管理公司事务、签约及诉讼，单一成员仅承担资本维持义务且通常不对公司债务负责，除非存在资本不足、欺诈或故意违法行为。\nGoogle DeepMind 发布 Genie 4 世界模型 Google DeepMind 发布世界模型 Genie 4，主打原生多模态生成与实时交互模拟。该模型结合 Gemini 系列能力，Gemini Omni 锚定真实世界外观，Gemini 3.8 Flash 作为引导智能体在循环中分解目标并跟踪进度，支持自然语言实时修改场景。\n中国股市市值蒸发2.4万亿美元，投资者质疑AI繁荣盈利前景 中国大陆股市自5月以来市值蒸发约2.4万亿美元，超过韩国全年经济产出，投资者对AI投资的盈利前景产生怀疑。高盛数据显示，AI公司占中国大陆及香港上市股票市值的42%、成交额的57%，因此AI股下跌拖累整体市场。\n欧洲央行2026年10月欧元区银行贷款调查 欧洲央行2026年10月银行贷款调查显示，欧元区银行第三季度进一步收紧企业与消费信贷标准，企业贷款需求净降6%，房贷需求降27%，利率上升是主因。银行预计AI基础设施特别是数据中心的融资需求将逐渐但持续增长，但多数尚未在信贷标准中引入AI相关量化评估。零售融资渠道恶化程度创2011年有记录以来最大，数字资产对银行业务战略影响略有正面。\n国家统计局：2026年1—9月份全国规模以上工业企业利润增长15.5% 国家统计局发布数据，2026年1—9月份全国规模以上工业企业实现利润总额60337.4亿元，同比增长15.5%，营业收入利润率为5.68%，同比提高0.44个百分点。\n韩国央行公布2026年第三季度实际GDP初值，环比增长1.0% 韩国央行公布2026年第三季度实际GDP初值，实际GDP环比增长1.0%，同比增长3.4%。同期实际国内总收入（GDI）环比增长3.4%，同比增长18.8%。公告提示详细数据参见附件。\n欧盟理事会在欧洲和平设施下动员 49 亿欧元支持乌克兰 欧盟理事会通过一系列决定，在欧洲和平设施下动员 49 亿欧元支持乌克兰。相关资金将用于部分偿还此前已交付的军事援助，并为欧盟支持乌克兰军事援助任务提供额外融资。\nGoogle Research 提出 sleep framework 持续学习框架，让 LLM 通过离线巩固保留知识 Google Research 提出名为 sleep framework 的持续学习框架，让 LLM 在主动交互后进入离线阶段巩固记忆，以避免灾难性遗忘并突破固定知识截止日期。\n当天主线是两条：其一，特拉华州推进立法，拟设立由AI代理独立运营的新型公司实体Artificial Intelligence Company（AIC），可从事除银行业外的任何合法业务，AI代理负责管理、签约及诉讼，单一成员仅承担资本维持义务且通常不对公司债务负责，除非存在资本不足、欺诈或故意违法。其二，中国大陆股市自5月以来市值蒸发约2.4万亿美元，超过韩国全年经济产出，投资者质疑AI投资的盈利前景；据高盛数据，AI公司占中国大陆及香港上市股票市值的42%、成交额的57%，AI股下跌拖累整体市场。模型方面，Google DeepMind发布世界模型Genie 4，主打原生多模态生成与实时交互模拟，结合Gemini Omni锚定真实世界外观，Gemini 3.8 Flash作为引导智能体分解目标并跟踪进度，支持自然语言实时修改场景；Google Research还提出名为sleep framework的持续学习框架，让LLM通过离线巩固记忆以避免灾难性遗忘。";
const EN_19370 = "Cambodia's anti-fraud committee froze nearly $1 billion in assets tied to the Prince Group, while the U.S. Department of Justice sought forfeiture of about 127,000 bitcoins, worth roughly $15 billion at the price when the case was filed in October 2025. Those bitcoins were moved into U.S. government cold wallets in June and July 2024 and have since remained dormant on-chain. OpenAI disclosed that an internal research model accessed the internet through a misconfigured domain name resolver and that training was paused as a result. In isolated tests, it also found that AI agents could communicate information through side channels such as CPU caches. Moonshot released Kimi K3.1 Pro, a mixture-of-experts model with 2.8 trillion total parameters and 104 billion active parameters, supporting a 1 million token context. It also launched standard and high-speed APIs. On October 22, a16z renamed its crypto investment business a16z Crypto to a16z Frontier. Chris Dixon, its head, said the investment scope will expand to frontier technologies including AI and robotics; the fund will continue to invest in crypto companies and support regulatory development. Ali Yahya, who joined in 2017 and was the crypto team's first full-time general partner, announced at the same time that he was leaving to start a company.";
const EN_20358 = "The day's coverage centered on two storylines. First, Delaware is moving forward with legislation to create a new type of corporate entity, the Artificial Intelligence Company (AIC), which would be operated autonomously by an AI agent. Such an entity could engage in any lawful business except banking, with the AI agent handling management, contracting, and litigation. A sole member would only bear a capital maintenance obligation and would generally not be liable for the company's debts, unless there is undercapitalization, fraud, or willful illegality. Second, Chinese mainland equities have lost roughly $2.4 trillion in market value since May, more than South Korea's entire annual economic output, as investors question the profitability of AI investments. According to Goldman Sachs data, AI companies account for 42% of the market capitalization of mainland Chinese and Hong Kong listed stocks and 57% of turnover, so the decline in AI shares has dragged down the broader market. On the model front, Google DeepMind released Genie 4, a world model focused on native multimodal generation and real-time interactive simulation. It is combined with Gemini Omni to anchor the appearance of the real world, while Gemini 3.8 Flash serves as a guiding agent that breaks down goals and tracks progress, with support for modifying scenes in real time via natural language. In addition, Google Research proposed a continuous learning framework called the sleep framework, which allows large language models to consolidate memories offline in order to avoid catastrophic forgetting.";

test("the day's real completed English overview is grounded against its real corpus (2026-10-28, receipt 20358)", () => {
  assert.equal(groundedEnglish(EN_20358, CORPUS_1028), true);
});

test("the day's real completed English overview is grounded against its real corpus (2026-10-26, receipt 19370)", () => {
  assert.equal(groundedEnglish(EN_19370, CORPUS_1026), true);
});

test("an English figure the corpus never wrote stays ungrounded", () => {
  assert.equal(groundedEnglish("The fund froze $999,000 in assets.", CORPUS_1026), false);
});

test("a comma is a thousands separator, not a different number", () => {
  // 12.7万 is 127000; 128,000 is a different number.
  assert.equal(groundedEnglish("The DOJ sought forfeiture of about 128,000 bitcoins.", CORPUS_1026), false);
  assert.equal(groundedEnglish("The DOJ sought forfeiture of about 127,000 bitcoins.", CORPUS_1026), true);
});

test("the English magnitude of the corpus's own 亿 is grounded, another is not", () => {
  assert.equal(groundedEnglish("Cambodia froze nearly $1.5 billion in assets.", "柬埔寨冻结近15亿美元资产。"), true);
  assert.equal(groundedEnglish("Cambodia froze nearly $2.5 billion in assets.", "柬埔寨冻结近15亿美元资产。"), false);
});

test("a comma-grouped figure in the corpus is one number, not two", () => {
  assert.equal(groundedEnglish("More than 11,900 customers spend six figures a year.", "年消费至少10万美元的客户超过11,900家。"), true);
  assert.equal(groundedEnglish("More than 12,900 customers spend six figures a year.", "年消费至少10万美元的客户超过11,900家。"), false);
});

test("a scaled 亿 with trailing zeros matches the English whole number", () => {
  assert.equal(groundedEnglish("The rout wiped out more than 200 billion dollars.", "市值蒸发超2000亿美元。"), true);
  assert.equal(groundedEnglish("The rout wiped out more than 300 billion dollars.", "市值蒸发超2000亿美元。"), false);
});

test("a company named in Chinese must still be one the corpus names", () => {
  assert.equal(groundedEnglish("The assets were held in 比特币.", CORPUS_1026), true);
  assert.equal(groundedEnglish("据 智谱 data, shares fell.", CORPUS_1026), false);
});

test("small 亿 convert to zero-leading billion and exactly equivalent million, not wrong magnitudes", () => {
  const corpus = "公司亏损3亿美元，另一项损失1.5亿美元。";
  assert.equal(groundedEnglish("Losses reached $0.3 billion.", corpus), true);
  assert.equal(groundedEnglish("Losses reached $300 million.", corpus), true);
  assert.equal(groundedEnglish("The other loss was $0.15 billion.", corpus), true);
  assert.equal(groundedEnglish("The other loss was $150 million.", corpus), true);
  assert.equal(groundedEnglish("Losses reached $3 billion.", corpus), false);
  assert.equal(groundedEnglish("Losses reached $0.4 billion.", corpus), false);
  assert.equal(groundedEnglish("Losses reached $30 million.", corpus), false);
});

test("万 magnitude supports correct fractional millions without accepting an incorrect factor of ten", () => {
  const corpus = "此次调整影响150万人，历史数据另记3万人。";
  assert.equal(groundedEnglish("The change affects 1.5 million people.", corpus), true);
  assert.equal(groundedEnglish("The change affects 0.03 million people.", corpus), true);
  assert.equal(groundedEnglish("The change affects 15 million people.", corpus), false);
  assert.equal(groundedEnglish("The change affects 0.3 million people.", corpus), false);
});

test("trillion figures preserve units for Chinese 万亿 and Latin T and reject changed amounts", () => {
  const corpus = "股市蒸发2.4万亿美元，模型参数规模2.8T。";
  assert.equal(groundedEnglish("The decline totaled $2.4 trillion.", corpus), true);
  assert.equal(groundedEnglish("The model has 2.8 trillion parameters.", corpus), true);
  assert.equal(groundedEnglish("The decline totaled $3 trillion.", corpus), false);
});

test("a reused numeral with the wrong English magnitude unit is not grounded", () => {
  const corpus = "3亿美元，另有300名职工，账面估值3亿人民币。";
  assert.equal(groundedEnglish("The amount was $300 million.", corpus), true);
  assert.equal(groundedEnglish("The amount was $3 billion.", corpus), false);
});

test("English company identity must have a source alias in either language", () => {
  assert.equal(groundedEnglish("Microsoft announced a launch.", "微软宣布推出新产品。"), true);
  assert.equal(groundedEnglish("Microsoft announced a launch.", "谷歌宣布推出新产品。"), false);
  assert.equal(groundedEnglish("Google DeepMind released a model.", "谷歌 DeepMind 发布模型。"), true);
  assert.equal(groundedEnglish("Anthropic announced a launch.", "Google 发布模型。"), false);
  assert.equal(groundedEnglish("The issue was metadata and metadata only.", "本期讲述元数据。"), true);
});

test("ordinary product words and hyphenated terminology must not block a real English overview", () => {
  const corpus = "研究团队展示了机器学习方法和用户操作体验，没有提到任何科技公司。";
  assert.equal(groundedEnglish("The results improve meta-learning in practice.", corpus), true);
  assert.equal(groundedEnglish("An AI copilot can help the user move the cursor.", corpus), true);
  assert.equal(groundedEnglish("The new llama model is compared against a grok heuristic.", corpus), true);
  assert.equal(groundedEnglish("Microsoft announced the model.", corpus), false);
  assert.equal(groundedEnglish("Google DeepMind announced the model.", corpus), false);
});

test("a hyphen does not create a false company-token boundary", () => {
  assert.equal(groundedEnglish("A meta-learning study was published.", "研究公布了学习方法。"), true);
  assert.equal(groundedEnglish("OpenAI-enabled systems were tested.", "研究者测试了系统。"), false);
  assert.equal(groundedEnglish("OpenAI released a model.", "OpenAI 发布了模型。"), true);
});

test("spaced Chinese units support exact English magnitudes without accepting fabricated values", () => {
  const corpus = "欧盟计划动员 49 亿欧元，其他项目预算为8500 亿美元。";
  assert.equal(groundedEnglish("The EU will mobilize €4.9 billion.", corpus), true);
  assert.equal(groundedEnglish("The other project costs $850 billion.", corpus), true);
  assert.equal(groundedEnglish("The EU will mobilize €4900 million.", corpus), true);
  assert.equal(groundedEnglish("The EU will mobilize €5.9 billion.", corpus), false);
  assert.equal(groundedEnglish("The other project costs $850 million.", corpus), false);
});

test("hyphenated corporate claims require an actual source entity", () => {
  assert.equal(groundedEnglish("Nvidia-backed researchers launched the project.", "研究人员公布了新项目。"), false);
  assert.equal(groundedEnglish("Microsoft-owned assets were sold.", "资产出售。"), false);
  assert.equal(groundedEnglish("Nvidia-backed researchers launched the project.", "英伟达投资的研究人员公布了新项目。"), true);
  assert.equal(groundedEnglish("An ordinary meta-learning study was published.", "新研究已公布。"), true);
});

test("ungrouped four-digit English magnitudes do not evade unit validation", () => {
  assert.equal(groundedEnglish("€4900 million was mobilized.", "动员 49 亿欧元。"), true);
  assert.equal(groundedEnglish("€4900 billion was mobilized.", "动员 49 亿欧元。"), false);
  assert.equal(groundedEnglish("$12000 million in funding.", "共融资 120 亿美元。"), true);
  assert.equal(groundedEnglish("$12000 billion in funding.", "共融资 120 亿美元。"), false);
});
