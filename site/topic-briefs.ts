// 主题简报：给头部主题写「本主题跟踪什么 / 看什么」的常青编辑文案（specs/003-content-assets FR-005）。
// 不是新闻结论——跟踪范围、关键变量和常见误读放在这里，新闻留在条目流里。未配置的主题不显示简报。
// 英文页只用英文文案；某主题没有英文就整块不显示。
export interface TopicBrief {
  /** 一句话：这个主题盯着什么。 */
  headline: string;
  /** 3 条：跟踪范围、关键变量、常见误读。 */
  bullets: string[];
  /** 最后一次人工更新（YYYY-MM-DD）。 */
  updated: string;
  headlineEn?: string;
  bulletsEn?: string[];
}

export const TOPIC_BRIEFS: Record<string, TopicBrief> = {
  "ai-models": {
    headline: "跟踪模型发布、能力评测与定价，区分「发布方说法」和「可复现结果」。",
    bullets: [
      "跟踪范围：主要实验室的模型与产品更新、公开评测、上下文与工具能力、价格与延迟。",
      "关键变量：评测是否可复现、第三方复测与发布方宣称的差距、推理成本随规模的变化。",
      "常见误读：单一基准高分不等于真实任务可用；演示片段不等于稳定行为。",
    ],
    updated: "2026-10-24",
    headlineEn: "Model releases, published evaluations and pricing — keeping vendors' claims apart from reproducible results.",
    bulletsEn: [
      "What we follow: model and product updates from major labs, public benchmarks, context and tool use, price and latency.",
      "What matters: whether an evaluation is reproducible, where independent reruns differ from the vendor's claim, and how inference cost moves with scale.",
      "Common misread: a single benchmark win does not mean a usable product, and a demo clip is not stable behaviour.",
    ],
  },
  "ai-infrastructure": {
    headline: "跟踪算力供给、芯片与数据中心产能，以及它们怎样反映到成本和交付上。",
    bullets: [
      "跟踪范围：芯片供应与出口限制、数据中心与云产能公告、资本开支、算力租赁价格。",
      "关键变量：订单与出货是否兑现、产能公告的投产时间、能源与并网约束。",
      "常见误读：宣布投资或建厂不等于立即投产；算力紧张不等于所有厂商都缺货。",
    ],
    updated: "2026-10-24",
    headlineEn: "Compute supply, chips and data-centre capacity — and how they show up in cost and delivery.",
    bulletsEn: [
      "What we follow: chip supply and export limits, data-centre and cloud capacity announcements, capex, and rental prices for compute.",
      "What matters: whether orders turn into shipments, when announced capacity actually enters service, and power/grid constraints.",
      "Common misread: an announced investment is not immediate production, and tight compute does not mean every vendor is short.",
    ],
  },
  "ai-agents": {
    headline: "跟踪 agent 的真实任务表现、权限设计与安全事件复盘。",
    bullets: [
      "跟踪范围：agent 产品发布、工具调用与长任务能力、权限与审计设计、安全事件与复盘。",
      "关键变量：真实任务成功率、失败模式与恢复、谁能看到和改动机器人的动作。",
      "常见误读：演示视频不等于生产可用；「自动完成」不等于可审计、可回滚。",
    ],
    updated: "2026-10-24",
    headlineEn: "How agents perform on real tasks, how their permissions are designed, and what security post-mortems say.",
    bulletsEn: [
      "What we follow: agent product launches, tool use and long-horizon tasks, permission and audit design, and security incidents with write-ups.",
      "What matters: success rates on real work, failure and recovery patterns, and who can see or change what the agent did.",
      "Common misread: a demo is not production readiness, and automation is not the same as auditable, reversible automation.",
    ],
  },
  stablecoins: {
    headline: "跟踪稳定币的合规、储备与结算口径，避免把链上转账量当成真实支付需求。",
    bullets: [
      "跟踪范围：发行方合规与牌照、储备披露与审计、链上结算口径、监管规则与执法。",
      "关键变量：规则生效时间与适用范围、储备构成变化、结算量与支付场景的区别。",
      "常见误读：链上转账量包含机器人刷量与内部转移，不等于真实支付需求。",
    ],
    updated: "2026-10-24",
    headlineEn: "Stablecoin compliance, reserves and settlement counts — without mistaking on-chain transfer volume for real payment demand.",
    bulletsEn: [
      "What we follow: issuer compliance and licences, reserve disclosures and audits, on-chain settlement definitions, and rules and enforcement.",
      "What matters: when rules take effect and whom they cover, shifts in reserve composition, and the gap between transfer volume and payments.",
      "Common misread: on-chain volume includes bots and internal moves; it is not the same as real payment demand.",
    ],
  },
  regulation: {
    headline: "跟踪监管处罚、立法与规则草案，重点看生效时间、适用范围和整改要求。",
    bullets: [
      "跟踪范围：监管机构处罚与调查、立法与规则草案、许可与准入变化、跨境协调。",
      "关键变量：规则何时生效、覆盖哪些主体与业务、罚单背后指向的制度缺口。",
      "常见误读：单次处罚不等于政策转向；一项草案不等于已经生效的规则。",
    ],
    updated: "2026-10-24",
    headlineEn: "Penalties, legislation and draft rules — with attention to effective dates, scope and what remediation is demanded.",
    bulletsEn: [
      "What we follow: regulator penalties and investigations, legislation and draft rules, licensing and access changes, and cross-border coordination.",
      "What matters: when a rule takes effect, whom it covers, and which institutional gap a penalty points at.",
      "Common misread: one penalty is not a policy turn, and a draft is not an effective rule.",
    ],
  },
  macro: {
    headline: "跟踪通胀、就业与利率的官方发布，区分「数据本身」和「市场怎么解读」。",
    bullets: [
      "跟踪范围：CPI、就业、GDP、利率决议等官方发布与修订、市场预期与反应。",
      "关键变量：发布节奏、初值与修订值的差异、预期差、统计口径变化。",
      "常见误读：单次数据不等于趋势；预期差引起的波动不等于基本面变化。",
    ],
    updated: "2026-10-24",
    headlineEn: "Official inflation, employment and rate releases — keeping the data apart from how markets read it.",
    bulletsEn: [
      "What we follow: official CPI, employment, GDP and rate decisions with revisions, and expectations versus reactions.",
      "What matters: release cadence, first versus revised prints, the surprise gap, and changes in statistical definitions.",
      "Common misread: one print is not a trend, and a surprise-driven move is not a change in fundamentals.",
    ],
  },
};
