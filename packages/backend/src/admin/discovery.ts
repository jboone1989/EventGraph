// Daily dynamic source discovery (specs/007 §D): coverage gaps (industry topics no enabled source
// tags) and active event groups become a handful of scoped searches for authoritative publisher
// endpoints. Results are ordinary lifecycle candidates —
// registered, previewed and trialled through the existing lifecycle functions; nothing here creates a
// source by itself. All paid work goes through deepseekSearch (deepseek_web budget + receipts); a
// missing budget or credential skips discovery for the day and never touches another feed.
import { createHash } from "node:crypto";
import { sql, type Db } from "../db.ts";
import { TOPICS } from "../publication/topics.ts";
import { deepseekSearch, type DeepSeekResult } from "../providers/deepseek-web.ts";
import { BudgetExceededError } from "../providers/receipts.ts";
import { sourceIdentity } from "./sources.ts";
import {
  DiscoveredSource, evaluateCandidate, lifecycleEnabled, previewCandidate, registerCandidates, startTrial,
  SOURCE_KIND_BY_CANDIDATE_KIND,
} from "./lifecycle.ts";

export const ACTOR = "system:source-discovery";

/** settings key; off by default — an operator opts in with finite caps. */
export const DISCOVERY_SETTINGS_KEY = "sourceLifecycle.discovery";
export const DISCOVERY_DEFAULTS = { enabled: false, maxGaps: 6, maxCandidates: 8 } as const;

/** A feed-looking endpoint (rss/atom/xml) is offered as an rss candidate and verified by its preview. */
const FEED_PATH = /(?:^|\/)(?:feed|feeds|rss|atom)(?:\/|$|\?|\.)|\.(?:rss|atom|xml|rdf)(?:$|\?)/i;
/** Governments, armies and multilateral bodies: their pages are primary sources and publish rarely. */
const OFFICIAL_HOST = /(?:^|\.)(gov|mil|int|edu)(?:\.[a-z]{2})?$/;
/** Hosts anyone can publish on: a search hit there is never a publisher lead. */
const BLOG_HOSTS = new Set(["medium.com", "substack.com", "wordpress.com", "blogspot.com", "tumblr.com", "zhihu.com", "weibo.com", "x.com", "twitter.com", "youtube.com", "reddit.com"]);
/** Only items newer than this are admitted at trial: enough for a dated preview, no history replay. */
/** DeepSeek Search hard limit; preserve the site: scope when trimming long events. */
export const MAX_DEEPSEEK_QUERY = 128;
const withinSearchLimit = (subject: string, suffix: string): string => {
  const reserve = Array.from(suffix).length;
  const prefix = Array.from(subject.trim()).slice(0, Math.max(0, MAX_DEEPSEEK_QUERY - reserve)).join("");
  return `${prefix.trimEnd()}${suffix}`;
};

const TRIAL_WINDOW_DAYS = 7;
/** A breaking-event source is wanted while the event is; two weeks, then it retires unless it proved itself. */
const EVENT_HORIZON_DAYS = 14;

export interface DiscoverySettings { enabled: boolean; maxGaps: number; maxCandidates: number }

export async function discoverySettings(db: Db = sql): Promise<DiscoverySettings> {
  const [row] = await db<{ value: { enabled?: boolean; maxGaps?: number; maxCandidates?: number } }[]>`
    SELECT value FROM settings WHERE key = ${DISCOVERY_SETTINGS_KEY}`;
  const v = row?.value ?? {};
  return {
    enabled: v.enabled === true,
    maxGaps: Math.min(Math.max(Math.trunc(Number(v.maxGaps ?? DISCOVERY_DEFAULTS.maxGaps)), 1), 20),
    maxCandidates: Math.min(Math.max(Math.trunc(Number(v.maxCandidates ?? DISCOVERY_DEFAULTS.maxCandidates)), 1), 20),
  };
}

export interface GapSubject {
  /** What the search asks for: a topic's name or an active event group's title. */
  subject: string;
  tags: string[];
  /** Active-event leads become breaking_event candidates with an expiry; topic gaps do not expire. */
  event: boolean;
}

/** 
 * Keep searching *covered* topics too: one news outlet is not complete
 * coverage. Rotate both sets by UTC day and reserve slots for active events.
 * This avoids always inspecting the same first few gaps when the budget is small.
 */
export function chooseDiscoverySubjects(
  events: GapSubject[], topics: GapSubject[], covered: Set<string>, maxGaps: number,
  utcDay = Math.floor(Date.now() / 86_400_000),
): GapSubject[] {
  const max = Math.max(1, Math.trunc(maxGaps));
  const eventCount = Math.min(events.length, Math.max(1, Math.floor(max / 3)));
  const slots = max - eventCount;
  const gaps = topics.filter(t => !t.tags.some(tag => covered.has(tag)));
  const existing = topics.filter(t => t.tags.some(tag => covered.has(tag)));
  const rotate = <T>(items: T[]) => {
    if (!items.length) return items;
    const offset = ((utcDay % items.length) + items.length) % items.length;
    return [...items.slice(offset), ...items.slice(0, offset)];
  };
  const rotatedGaps = rotate(gaps), rotatedExisting = rotate(existing);
  const coveredSlots = slots >= 2 ? Math.max(1, Math.floor(slots / 3))
    : slots === 1 && utcDay % 2 === 1 ? 1 : 0;
  const selected = [
    ...rotatedGaps.slice(0, Math.max(0, slots - coveredSlots)),
    ...rotatedExisting.slice(0, coveredSlots),
  ];
  const seen = new Set(selected.map(s => s.subject));
  for (const topic of [...rotatedGaps, ...rotatedExisting]) {
    if (selected.length >= slots) break;
    if (!seen.has(topic.subject)) { seen.add(topic.subject); selected.push(topic); }
  }
  return [...events.slice(0, eventCount), ...selected].slice(0, max);
}

/** Source-tag gaps and rotating covered sectors, plus recent active conflicts. */
export async function buildGapSubjects(maxGaps: number, db: Db = sql): Promise<GapSubject[]> {
  const covered = new Set((await db<{ tag: string }[]>`
    SELECT DISTINCT unnest(tags) AS tag FROM sources WHERE enabled AND tags <> '{}'`).map((r) => r.tag));
  const events = (await db<{ title: string }[]>`
    SELECT title FROM stories WHERE merged_into IS NULL AND latest_at > now() - interval '48 hours'
    ORDER BY latest_at DESC LIMIT ${maxGaps}`).map((r) => ({ subject: r.title.slice(0, 200), tags: [], event: true }));
  const topics = TOPICS
    .filter((t) => !t.entityId && t.tags.length > 0)
    .map((t) => ({ subject: t.name, tags: t.tags, event: false }));
  return chooseDiscoverySubjects(events, topics, covered, maxGaps);
}

/**
 * Identities already on file: every source (enabled or not) and every candidate. A lead whose
 * canonical RSS URL or DeepSeek query+publisher-prefix matches one of these adds nothing; anything
 * else is new — the same publisher domain may hold several independent feeds, each its own identity.
 */
export async function existingIdentities(db: Db = sql): Promise<Set<string>> {
  const sources = await db<{ kind: string; config: Record<string, unknown> }[]>`
    SELECT kind, config FROM sources WHERE kind IN ('rss', 'json_list')`;
  const candidates = await db<{ identity: string }[]>`SELECT identity FROM source_candidates`;
  const identities = new Set(candidates.map((r) => r.identity));
  for (const s of sources) {
    const id = sourceIdentity(s.kind, s.config);
    if (id) identities.add(id);
  }
  return identities;
}

export type Search = typeof deepseekSearch;

/** Deterministic candidate id from the same string that forms its identity. */
const idFrom = (s: string): string => {
  // Slugification drops Chinese, Arabic, etc. Two distinct scoped queries for the
  // same site would then share an id. Append a content hash of the original identity.
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 54) || "lead";
  const digest = createHash("sha256").update(s).digest("hex").slice(0, 12);
  return `ds-${slug}-${digest}`;
};

/** One qualified publisher lead from one search result; null when the hit is not a publisher. */
export function leadFromResult(s: GapSubject, r: DeepSeekResult, now: Date): DiscoveredSource | null {
  let u: URL;
  try { u = new URL(r.url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const domain = u.hostname.replace(/^www\./, "").toLowerCase();
  if (!domain || [...BLOG_HOSTS].some(host => domain === host || domain.endsWith(`.${host}`)) || domain.length > 100) return null;
  const official = OFFICIAL_HOST.test(domain);
  const feed = FEED_PATH.test(u.pathname);
  // A publisher lead is either the feed endpoint itself or an official domain we scope a search to;
  // everything else (media homepages, aggregators, blog spam) is not a source we can verify.
  if (!feed && !official) return null;
  const siteQuery = withinSearchLimit(s.subject, ` site:${domain}`);
  const publishedAfter = new Date(now.getTime() - TRIAL_WINDOW_DAYS * 86_400_000).toISOString();
  const provenance = `publisher=${domain} authority=${r.authority} via=${r.url}`;
  const base = {
    id: idFrom(feed ? r.url : siteQuery),
    origin: {
      channel: (s.event ? "breaking_event" : "deepseek") as "breaking_event" | "deepseek",
      note: `${s.event ? "active event" : "coverage gap"}: ${s.subject}; ${provenance}`,
    },
    name: (r.site_name?.trim() || domain).slice(0, 200),
    // officialLowFrequency is an operator-verified attestation (preflight refuses it from auto
    // channels); discovery only tags first-hand vs second-hand.
    rationale: `${s.event ? "active event" : "coverage gap"}「${s.subject}」wants a primary publisher; ${provenance}`.slice(0, 1000),
    tags: [...new Set([...(s.event ? ["lifecycle-event"] : s.tags), official ? "一手" : "二手"])].slice(0, 30),
    ...(s.event ? { expiresAt: new Date(now.getTime() + EVENT_HORIZON_DAYS * 86_400_000).toISOString() } : {}),
  };
  return feed
    ? DiscoveredSource.parse({ ...base, kind: "rss", config: { feedUrl: r.url, publishedAfter, _aihot: { initialBackfillLimit: 2 } } })
    : DiscoveredSource.parse({
      ...base, kind: "json_list",
      config: {
        mode: "deepseek_search",
        deepseekQuery: siteQuery,
        deepseekCount: 5,
        allowUrlPrefixes: [`${u.origin.replace(/\/$/, "")}/`],
        publishedAfter,
        _aihot: { initialBackfillLimit: 2 },
      },
    });
}

const identityOf = (c: DiscoveredSource): string | null =>
  sourceIdentity(SOURCE_KIND_BY_CANDIDATE_KIND[c.kind], c.config);

/** The DeepSeek discovery: one scoped search per subject, de-duplicated by candidate identity. */
export async function discoverViaDeepSeek(
  subjects: GapSubject[], existing: Set<string>, opts: { maxCandidates: number; now?: Date; search?: Search },
): Promise<{ candidates: DiscoveredSource[]; queries: number; failures: number; firstError: string | null }> {
  const search = opts.search ?? deepseekSearch;
  const now = opts.now ?? new Date();
  const seen = new Set(existing);
  const candidates: DiscoveredSource[] = [];
  let queries = 0;
  let failures = 0;
  let firstError: string | null = null;
  for (const s of subjects) {
    if (candidates.length >= opts.maxCandidates) break;
    // One failing subject must not discard successful searches for other regions or topics.
    let results: DeepSeekResult[];
    try {
      results = await search(withinSearchLimit(s.subject, " official newsroom press release RSS feed"), {
        count: 8, purpose: "source_discovery", subject: s.event ? `event:${s.subject}` : `gap:${s.subject}`,
      });
    } catch (error) {
      if (error instanceof BudgetExceededError || /DEEPSEEK_API_KEY/.test(String(error))) throw error;
      failures += 1;
      firstError ??= String((error as Error)?.message ?? error).slice(0, 200);
      continue;
    }
    queries += 1;
    for (const r of results) {
      if (candidates.length >= opts.maxCandidates) break;
      const lead = leadFromResult(s, r, now);
      if (!lead) continue;
      const identity = identityOf(lead);
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      candidates.push(lead);
    }
  }
  return { candidates, queries, failures, firstError };
}

export interface DiscoveryRun {
  /** Trials reviewed by the daily evaluation cycle (free; runs even when discovery is off). */
  evaluated: number;
  skipped?: "disabled" | "budget" | "credential";
  subjects: string[];
  queries: number;
  searchFailures: number;
  proposed: number;
  registered: number;
  previewed: number;
  previewPassed: number;
  trialsStarted: number;
  note?: string;
}

/**
 * The daily lifecycle run: evaluate every trial (decisions apply only under sourceLifecycle.autoPromote),
 * then — when its settings key is on — search the gaps and walk every pending candidate through
 * preview and, if allowed, into a T2 hot_signal trial. A spent budget or missing credential skips
 * the paid half cleanly; one subject's failed search does not stop the others.
 */
export async function runDailyDiscovery(opts: { now?: Date; search?: Search; db?: Db } = {}): Promise<DiscoveryRun> {
  const db = opts.db ?? sql;
  const trials = await db<{ id: string }[]>`SELECT id FROM source_candidates WHERE status = 'trial' ORDER BY created_at`;
  for (const t of trials) await evaluateCandidate(t.id, { db });
  const run: DiscoveryRun = { evaluated: trials.length, subjects: [], queries: 0, searchFailures: 0, proposed: 0, registered: 0, previewed: 0, previewPassed: 0, trialsStarted: 0 };
  const settings = await discoverySettings(db);
  if (!settings.enabled) return { ...run, skipped: "disabled" };
  const subjects = await buildGapSubjects(settings.maxGaps, db);
  run.subjects = subjects.map((s) => s.subject);
  let candidates: DiscoveredSource[] = [];
  try {
    const found = await discoverViaDeepSeek(subjects, await existingIdentities(db), {
      maxCandidates: settings.maxCandidates, now: opts.now, search: opts.search,
    });
    candidates = found.candidates;
    run.queries = found.queries;
    run.searchFailures = found.failures;
    if (found.failures) run.note = `search: ${found.failures} subject(s) failed: ${found.firstError}`;
  } catch (error) {
    const message = String((error as Error | undefined)?.message ?? error).slice(0, 200);
    // Paid discovery can be unavailable without blocking already validated
    // candidates from entering an authorized trial or existing trials from review.
    if (error instanceof BudgetExceededError) run.skipped = "budget";
    else if (/DEEPSEEK_API_KEY/.test(message)) run.skipped = "credential";
    else run.note = `search: ${message}`;
  }
  run.proposed = candidates.length;
  const registered = await registerCandidates({ candidates, actor: ACTOR, db });
  run.registered = registered.filter((r) => r.status === "discovered" && r.preflightReasons.length === 0).length;
  const auto = await lifecycleEnabled(db);
  // Every pending candidate gets its daily walk, not only today's registrations: one registered while
  // autoPromote was off must still enter its trial once an operator enables it.
  const pending = await db<{ id: string; preflight: { previewPassed?: boolean }; expires_at: Date | null }[]>`
    SELECT id, preflight, expires_at FROM source_candidates
    WHERE status = 'discovered' AND NOT manual_hold ORDER BY created_at`;
  const now = opts.now ?? new Date();
  for (const c of pending) {
    // Failed previews are terminal under the lifecycle spec: never re-pay for dead leads.
    // Likewise, do not start an expired event source even if an earlier preview passed.
    if (c.preflight?.previewPassed === false || (c.expires_at && new Date(c.expires_at) <= now)) {
      const reason = c.preflight?.previewPassed === false ? "preview" : "expired";
      await db`UPDATE source_candidates SET status = 'preflight_failed',
        preflight = preflight || ${db.json({ ok: false, reasons: [reason] } as never)}, updated_at = now()
        WHERE id = ${c.id} AND status = 'discovered'`;
      continue;
    }
    // previewCandidate runs the real collector preview (publication window enforced there) and
    // records the outcome itself; its dates are the preview's proof, not a search result's claim.
    // An already-passed preview is never paid for twice — it goes straight to the trial decision.
    if (c.preflight?.previewPassed !== true) {
      if (run.previewed >= settings.maxCandidates) continue;
      const preview = await previewCandidate(c.id, ACTOR, db);
      run.previewed += 1;
      if (!preview.passed) {
        await db`UPDATE source_candidates SET status = 'preflight_failed', updated_at = now()
          WHERE id = ${c.id} AND status = 'discovered'`;
        continue;
      }
      run.previewPassed += 1;
    }
    if (auto && (await startTrial(c.id, ACTOR, db)).started) run.trialsStarted += 1;
  }
  return run;
}
