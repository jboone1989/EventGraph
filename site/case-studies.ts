// 跨事件过程实验的案例定义（specs/event-evolution-experiment）：人工策展、可审查的仓库内容。
// 每条轨道引用一个既有公开 Story 的 publicId，站点与证据由后端经 publication 读层按当前公开条件重新
// 读取（撤稿即消失）；跨事件联系逐条人工标注类型与原始出处，未经核实的共现不画线。
// 本文件是编辑内容，不是数据表：案例下线就删条目，引用的 Story 保持原样。

/** 轨道间人工标注的联系类型；语义必须能被原始来源直接核查，禁止由共现或时间临近推断。 */
export type CaseStudyLinkType =
  | "response" // 一方公开回应/应对另一方事件（如竞争对手的预防措施）
  | "citation" // 报道明确引用另一事件作为背景或证据
  | "dependency" // 客观依赖（如官方文件列明的适用对象）
  | "claim" // 有署名的主张/指控，另一方可能否认；只标注归属，不判真伪
  | "follow-up"; // 报道明确指认为同一发生的后续发展

export interface CaseStudyTrackDef {
  /** 案例内稳定键，如 "ledger-implant"。 */
  key: string;
  /** 轨道对应公开 Story 的 publicId。 */
  storyPublicId: string;
  label: string;
  labelEn: string;
}

export interface CaseStudyLinkEvidenceDef {
  /** 支持该联系的原始出处（报道或公告原文）。 */
  url: string;
  /** 出处机构名。 */
  source: string;
  /** 出处发布时间（ISO）。 */
  publishedAt: string;
  /** 主张的署名/归属；claim 类型必填，其余可空。 */
  attribution?: string;
  attributionEn?: string;
}

export interface CaseStudyLinkDef {
  key: string;
  /** 做出响应/引用/声称的一方轨道。 */
  from: string;
  /** 被指向的一方轨道。 */
  to: string;
  type: CaseStudyLinkType;
  note: string;
  noteEn: string;
  evidence: CaseStudyLinkEvidenceDef;
  /** 本次标注时间（ISO 日期）。 */
  curatedAt: string;
}

/** 与某轨道同期发生、但未核实联系而不画线的说明（负例也要可审查）。 */
export interface CaseStudyUnlinkedDef {
  track: string;
  note: string;
  noteEn: string;
}

export interface CaseStudyDef {
  /** URL 中的 case id（小写 slug）。 */
  id: string;
  title: string;
  titleEn: string;
  summary: string;
  summaryEn: string;
  /** 最后一次人工更新（YYYY-MM-DD）。 */
  updated: string;
  tracks: CaseStudyTrackDef[];
  links: CaseStudyLinkDef[];
  unlinked: CaseStudyUnlinkedDef[];
}

// 案例：2026-10 硬件钱包供应链攻击。四条轨道全部来自本站公开 Story：
// Ledger 植入装置（4b6afb0b…）、攻击者归属确认（2c8cf581…）、“早已知情”争执（e202f354…）、
// Keystone 独立泄露（fb2ad078…）。两条跨事件联系的出处为本站收录的原文 URL；
// Keystone 轨道经逐条核对双方来源原文互不引用，作为不画线的负例保留。
export const CASE_STUDIES: Record<string, CaseStudyDef> = {
  "wallet-tampering-2026-10": {
    id: "wallet-tampering-2026-10",
    title: "硬件钱包供应链攻击与各方回应（2026年10月）",
    titleEn: "Hardware wallet supply-chain attack and its responses (October 2026)",
    summary:
      "Ledger 披露其东南亚经销商 CryptoBilis 售出的设备被植入读取助记词的 LTE 硬件；随后出现对攻击者身份的进一步确认、围绕「是否早已知情」的公开争执，以及另一家厂商 Keystone 的独立数据泄露。本实验把四个公开事件并排成四条轨道：站点与证据全部来自本站已公开的事实记录，轨道间仅有的两条联系为人工标注并附原始出处。",
    summaryEn:
      "Ledger disclosed LTE implants in devices sold by its Southeast-Asian reseller CryptoBilis; what followed included a further attribution of the attack, a public dispute over what Ledger knew and when, and an unrelated breach at another wallet maker, Keystone. This experiment lays four public events side by side: every station and its evidence come from this site's public records, and the only two cross-event links are manually annotated with their sources.",
    updated: "2026-10-26",
    tracks: [
      {
        key: "ledger-implant",
        storyPublicId: "4b6afb0b-f347-4289-81dd-e3ed2e92ffd8",
        label: "Ledger：植入装置的发现",
        labelEn: "Ledger: finding the implant",
      },
      {
        key: "attribution",
        storyPublicId: "2c8cf581-dbcb-4846-9a3b-fed9e62b4b0c",
        label: "攻击者身份的确认",
        labelEn: "Attributing the attack",
      },
      {
        key: "foreknowledge-dispute",
        storyPublicId: "e202f354-8181-422b-a4ec-b348ee5d415f",
        label: "「早已知情」争执",
        labelEn: "The foreknowledge dispute",
      },
      {
        key: "keystone-breach",
        storyPublicId: "fb2ad078-6323-4b9a-a0d6-9b17d2680001",
        label: "Keystone：另一家厂商的泄露",
        labelEn: "Keystone: another maker's breach",
      },
    ],
    links: [
      {
        key: "attribution-follows-implant",
        from: "attribution",
        to: "ledger-implant",
        type: "follow-up",
        note: "Bitcoin Magazine 报道 Ledger 声明：有组织犯罪团体花费数百万美元购入并植入硬件钱包，报道引述同一攻击约 8600 万美元的被盗金额——这是同一发生的后续披露，不改变事件归属。",
        noteEn: "Bitcoin Magazine reported Ledger's statement that an organized crime group spent millions buying and implanting hardware wallets, citing the same ~$86M drain — a follow-up disclosure of the same occurrence.",
        evidence: {
          url: "https://bitcoinmagazine.com/news/ledger-says-crime-group-spent-millions",
          source: "Bitcoin Magazine",
          publishedAt: "2026-10-15T15:58:08.000Z",
        },
        curatedAt: "2026-10-26",
      },
      {
        key: "foreknowledge-claim",
        from: "foreknowledge-dispute",
        to: "ledger-implant",
        type: "claim",
        note: "BeInCrypto 报道双方公开争执：前 Mt. Gox CEO Mark Karpelès 指控 Ledger 早在 2026 年 3 月已知植入装置，Ledger 否认。此为来源声称，本站只标注归属，不判定真伪。",
        noteEn: "BeInCrypto reported the public clash: former Mt. Gox CEO Mark Karpelès alleges Ledger knew about the implants as early as March 2026; Ledger denies it. A source claim — this site records the attribution and does not adjudicate it.",
        evidence: {
          url: "https://beincrypto.com/ledger-ceo-karpeles-spy-implant-clash/",
          source: "BeInCrypto",
          publishedAt: "2026-10-18T07:39:29.000Z",
          attribution: "Mark Karpelès（前 Mt. Gox CEO）主张，Ledger 否认",
          attributionEn: "Claimed by Mark Karpelès (former Mt. Gox CEO); Ledger disputes it",
        },
        curatedAt: "2026-10-26",
      },
    ],
    unlinked: [
      {
        track: "keystone-breach",
        note: "Keystone 官网数据泄露是另一家硬件钱包厂商的独立事件：两组报道互不引用（已逐条核对双方来源原文），只是同属硬件钱包安全话题且同期发生。未核实联系前不画线——同期与同主题都不是联系。",
        noteEn: "The Keystone website breach is a separate event at another wallet maker: neither side's reporting cites the other (checked article by article); they share only a topic and a time window. No link is drawn until one is verified — coincidence in time or topic is not a connection.",
      },
    ],
  },
};
