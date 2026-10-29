import assert from "node:assert/strict";
import { test } from "node:test";
import { IMPACT_EVIDENCE_KINDS } from "@aihot/contracts/site";
import type { ImpactEvidenceKind, StoryDetail, StoryRoute, StoryRouteStation } from "@aihot/contracts/site";
import { impactLeadsAt, marketObservationAt } from "../app/features/story/impact-evidence.ts";
import {
  IMPACT_STATION_LAYERS, LAYER_LABELS, displayableStationReports, stationEvidenceAt, stationLayer,
} from "../app/features/story/impact-layers.ts";

// Real-sample fixtures (read-only dev-DB check, 2026-10-28; specs/event-impact-tracing §5/§6):
// T0 story 3d1ae73d… fact fIEpWumpna_g — IRGC announces two supertankers struck mines in the
// Strait of Hormuz; sole report chinanews wj1su9a21… published 2026-10-23T22:36:43Z, discovered
// 2026-10-25T01:08:06.272Z, revision 2. USTR story 7bdc9a83… fact f4kjwe-E2g4k — USTR warns an
// EIB Airbus loan may endanger the tariff truce. Mercuria text per T06 audit §6.1 (gCaptain/
// Bloomberg background article; an existing conflict's market mechanics, not this event's impact).

const t0Station = {
  factId: "fIEpWumpna_g", title: "两艘超级油轮在霍尔木兹海峡触雷爆炸",
  subject: "伊朗伊斯兰革命卫队海军", action: "宣布两艘超级油轮在霍尔木兹海峡南部触雷爆炸",
  object: "两艘载有超450万桶原油的超级油轮", timeEffective: "2026-10-22T16:00:00.000Z",
  timeRecorded: "2026-10-25T01:08:06.272Z",
  reports: [{ articleId: "wj1su9a21jgk1r4mmjnajvqu8", url: "https://www.chinanews.com.cn/gj/2026/10-24/10720169.shtml",
    source: "中国新闻网 · 国际", publishedAt: "2026-10-23T22:36:43.000Z", discoveredAt: "2026-10-25T01:08:06.272Z", revision: 2 }],
  sourceCount: 1, uncertainty: { singleSource: true, occurredAtMissing: false, revised: true },
} satisfies StoryRouteStation;

const route = (stations: StoryRouteStation[]) => ({
  schemaVersion: 1, story: { publicId: "00000000-0000-0000-0000-000000000001", title: "A real event" },
  status: "ok" as const, reason: null, generatedAt: "2026-10-28T00:00:00.000Z",
  limits: { stationLimit: 24, reportLimit: 6, truncated: false },
  stations, coverage: { stations: stations.length, reports: stations.length, sources: 1 },
}) satisfies StoryRoute;
const timelineReport = (id: string, title: string, publishedAt: string, discoveredAt: string) => ({
  id, title, originalTitle: null, summary: null,
  source: { name: "Example publisher", firstParty: false }, publishedAt, discoveredAt,
  selected: true, english: null,
}) satisfies StoryDetail["timeline"][number];

test("the five layers classify deterministically from real-shaped stations", () => {
  // T0 real fields: the action states the mine strike, so conflict wins over the tanker object.
  assert.equal(stationLayer(t0Station), "conflict_event");
  // Real USTR fields: a warning about a tariff truce is a verbal act, not an enacted policy.
  assert.equal(stationLayer({
    ...t0Station, title: "美贸易代表警告空客贷款威胁欧美关税休战",
    subject: "美国贸易代表办公室（Jamieson Greer）",
    action: "警告欧盟投资银行向空客提供的30亿欧元贷款可能危及美欧关税休战",
    object: "欧洲投资银行30亿欧元（34亿美元）空客贷款及美欧贸易休战",
  }), "policy_statement");
  // A disclosure is only a disclosure when the fact's own action states it.
  assert.equal(stationLayer({
    ...t0Station, title: "公司在冲突后宣布工厂停产", subject: "某上市公司",
    action: "宣布工厂停产", object: "受影响产线",
  }), "company_disclosure");
  // T0's title without a structured action: reading-group only, never conflict.
  assert.equal(stationLayer({ ...t0Station, action: null }), "logistics_observation");
  // E2E-shaped fact with no dictionary hits stays unclassified instead of being forced.
  assert.equal(stationLayer({
    ...t0Station, title: "E2E Lab releases an open reasoning model",
    subject: "E2E Lab", action: "releases an open reasoning model for long documents", object: "an open reasoning model",
  }), "unclassified");
});

test("conflict action outranks a tanker object and tariff text outranks shipping text", () => {
  assert.equal(stationLayer(t0Station), "conflict_event", "T0: 触雷爆炸 action beats 油轮 object");
  assert.equal(stationLayer({
    ...t0Station, title: "关税影响航运成本", subject: "某海关部门",
    action: "提高关税影响航运成本", object: "相关航线",
  }), "policy_statement", "a non-conflict tariff action reads as policy, not logistics");
});

test("missing structured action never unlocks conflict or company layers by title co-occurrence", () => {
  const conflictWordsInTitle = { ...t0Station, title: "船只在海峡触雷爆炸后袭击护航队", action: null, object: null };
  assert.notEqual(stationLayer(conflictWordsInTitle), "conflict_event");
  const companyWordsInTitle = { ...t0Station, title: "多家企业披露财报并宣布停产", action: null, object: null };
  assert.notEqual(stationLayer(companyWordsInTitle), "company_disclosure");
});

test("N1: the real Mercuria co-occurrence is not a company disclosure", () => {
  // Real article text (T06 §6.1): a commodity trader sues over a tanker benchmark — company
  // name + conflict background, no disclosure statement of the company itself.
  const mercuria = {
    ...t0Station, title: "Hormuz Chaos Sparks Legal Showdown Over Global Tanker Pricing",
    subject: "Mercuria Energy Group",
    action: "起诉 Baltic Exchange 未在伊朗战争扰动霍尔木兹出口后暂停 TD3C 油轮基准运价",
    object: "TD3C 油轮基准运价",
  };
  const layer = stationLayer(mercuria);
  assert.notEqual(layer, "company_disclosure");
  assert.equal(layer, "logistics_observation", "reading group only: 油轮/霍尔木兹 vocabulary");
  const lawsuitEn = stationLayer({ ...mercuria, action: "sues Baltic Exchange over the TD3C tanker benchmark", object: "TD3C tanker freight benchmark" });
  assert.notEqual(lawsuitEn, "company_disclosure");
});

test("N4: layer labels never carry policy-stage or causal-effect wording", () => {
  const stage = /拟议|宣布|生效|撤销|proposed|announced|enacted|effective|revoked/i;
  const causal = /影响|导致|生效|caus(?:e|ed|es|ing)|leads to|results in/i;
  for (const [zh, en] of Object.values(LAYER_LABELS)) {
    assert.doesNotMatch(zh, stage);
    assert.doesNotMatch(en, stage);
    assert.doesNotMatch(zh, causal, `layer labels group reading, they never assert effect: ${zh}`);
    assert.doesNotMatch(en, causal);
  }
  assert.deepEqual(IMPACT_STATION_LAYERS, [
    "conflict_event", "policy_statement", "company_disclosure", "logistics_observation", "unclassified",
  ], "one station, one layer, from a closed set");
});

test("AC-1: every rendered item's evidenceKind comes from the closed contracts vocabulary", () => {
  assert.deepEqual([...IMPACT_EVIDENCE_KINDS], ["fact_station", "related_reporting", "market_observation"]);
  const kinds = stationEvidenceAt(route([t0Station]), "2026-10-27T00:00:00Z", "known").map(i => i.evidenceKind);
  assert.deepEqual(kinds, ["fact_station"]);
  const leads = impactLeadsAt(route([t0Station]), [timelineReport("wj1su9a21jgk1r4mmjnajvqu8", t0Station.title, "2026-10-23T22:36:43.000Z", "2026-10-25T01:08:06.272Z")], "2026-10-27T00:00:00Z", "known");
  assert.ok(Object.values(leads).flat().every(x => (x.evidenceKind satisfies ImpactEvidenceKind) === "related_reporting"));
  // Market observations only ever come from snapshots, never from report text.
  assert.equal(marketObservationAt(null, "2026-10-27T00:00:00Z"), null);
});

test("N2: a numeric co-occurrence like DEV \"$117\" never becomes a market observation", () => {
  const dev = stationLayer({ ...t0Station, title: 'Dev, the DEV token, at "$117"', subject: "DEV", action: "traded at $117", object: null });
  assert.equal(dev, "unclassified");
  const items = stationEvidenceAt(route([{ ...t0Station, title: 'Dev, the DEV token, at "$117"', action: "traded at $117" }]), "2026-10-27T00:00:00Z", "known");
  assert.ok(items.every(i => i.evidenceKind === "fact_station"), "station text cannot mint market items");
});

test("N3: T0's real timestamps reproduce the known/valid cutoff behavior for stations and leads", () => {
  const chinanews = timelineReport("wj1su9a21jgk1r4mmjnajvqu8", t0Station.title, "2026-10-23T22:36:43.000Z", "2026-10-25T01:08:06.272Z");
  const r = route([t0Station]);
  // Before the site discovered the report (2026-10-25 01:08Z) nothing is known.
  assert.equal(stationEvidenceAt(r, "2026-10-24T12:00:00Z", "known").length, 0);
  assert.equal(impactLeadsAt(r, [chinanews], "2026-10-24T12:00:00Z", "known").logistics.length, 0);
  // Valid time is retrospective: the published report (2026-10-23 22:36Z) is already visible.
  assert.equal(stationEvidenceAt(r, "2026-10-24T12:00:00Z", "valid").length, 1);
  assert.equal(impactLeadsAt(r, [chinanews], "2026-10-24T12:00:00Z", "valid").logistics.length, 1);
  // After discovery both clocks agree.
  assert.equal(stationEvidenceAt(r, "2026-10-25T02:00:00Z", "known").length, 1);
  assert.equal(impactLeadsAt(r, [chinanews], "2026-10-25T02:00:00Z", "known").logistics.length, 1);
});

test("AC-2/N3: evidence drawers receive only reports visible at the selected known/valid cutoff", () => {
  const early = {
    ...t0Station.reports[0]!, articleId: "early",
    url: "https://example.org/early", publishedAt: "2026-10-23T10:00:00Z",
    discoveredAt: "2026-10-24T10:00:00Z",
  };
  const later = {
    ...early, articleId: "later", url: "https://example.org/later",
    publishedAt: "2026-10-26T10:00:00Z", discoveredAt: "2026-10-27T10:00:00Z",
  };
  const undated = { ...early, articleId: "undated", publishedAt: null };
  const unsafe = { ...early, articleId: "unsafe", url: "javascript:alert(1)" };
  const r = route([{ ...t0Station, reports: [early, later, undated, unsafe] }]);
  const visibleIds = (at: string, clock: "known" | "valid") =>
    stationEvidenceAt(r, at, clock).flatMap(item => item.station.reports.map(report => report.articleId));

  assert.deepEqual(visibleIds("2026-10-25T00:00:00Z", "known"), ["early"],
    "future-discovered links must not leak through a visible station's drawer");
  assert.deepEqual(visibleIds("2026-10-26T12:00:00Z", "valid"), ["early", "later"],
    "valid time can show a published report before its later discovery");
  assert.deepEqual(visibleIds("2026-10-26T12:00:00Z", "known"), ["early"],
    "known time must still hide the later-discovered report");
  assert.deepEqual(visibleIds("2026-10-28T00:00:00Z", "known"), ["early", "later"],
    "undated and unsafe reports must never appear even at the latest cutoff");
  const offset = {
    ...early, articleId: "offset",
    publishedAt: "2026-10-23T18:00:00+08:00",
    discoveredAt: "2026-10-24T18:00:00+08:00",
  };
  assert.deepEqual(
    stationEvidenceAt(route([{ ...t0Station, reports: [offset] }]), "2026-10-25T00:00:00Z", "known")
      .flatMap(item => item.station.reports.map(report => report.articleId)),
    ["offset"], "explicit timezone offsets are valid, not just Z timestamps");
});

test("AC-2: reports without a safe URL or required timestamps hide the station, honestly", () => {
  assert.equal(stationEvidenceAt(route([{ ...t0Station, reports: [{ ...t0Station.reports[0]!, url: "javascript:alert(1)" }] }]), "2026-10-27T00:00:00Z", "valid").length, 0);
  assert.equal(stationEvidenceAt(route([{ ...t0Station, reports: [{ ...t0Station.reports[0]!, publishedAt: null }] }]), "2026-10-27T00:00:00Z", "known").length, 0);
  assert.equal(stationEvidenceAt(null, "2026-10-27T00:00:00Z", "known").length, 0);
  assert.equal(stationEvidenceAt(route([t0Station]), "not-a-date", "known").length, 0, "an unparseable cutoff yields nothing");
  // An occurredAtMissing station still displays — with its flag, never a fabricated time.
  const noOccurrence = stationEvidenceAt(route([{ ...t0Station, timeEffective: null, uncertainty: { ...t0Station.uncertainty, occurredAtMissing: true } }]), "2026-10-27T00:00:00Z", "valid");
  assert.equal(noOccurrence.length, 1);
  assert.equal(noOccurrence[0]!.station.uncertainty.occurredAtMissing, true);
  assert.equal(noOccurrence[0]!.station.timeEffective, null);
});


test("AC-2: raw story-route drawers exclude reports missing safe URLs or either required timestamp", () => {
  const good = { ...t0Station.reports[0]!, articleId: "good" };
  const missingPublished = { ...good, articleId: "missing-published", publishedAt: null };
  const missingDiscovered = { ...good, articleId: "missing-discovered", discoveredAt: null } as unknown as typeof good;
  const unzoned = { ...good, articleId: "unzoned", publishedAt: "2026-10-23T22:36:43" };
  const unsafe = { ...good, articleId: "unsafe", url: "javascript:alert(1)" };
  const visible = displayableStationReports({
    ...t0Station, reports: [good, missingPublished, missingDiscovered, unzoned, unsafe],
  }).map(report => report.articleId);
  assert.deepEqual(visible, ["good"]);
});
