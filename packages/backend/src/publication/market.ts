// An event beside the prices around it: the assets its reports name, each priced just before the event's
// first public report and a day later (or at the latest snapshot while that day is not over). Prices are
// set side by side only; nothing here says the event moved them.
import { SPOT_ASSETS, type SpotAsset } from "../market-spot.ts";
import { sql } from "../db.ts";
import { storyReportCondition } from "./scope.ts";

const NAMES: Record<SpotAsset, RegExp> = {
  BTC: /(?<![A-Za-z])(BTC|Bitcoin)(?![A-Za-z])|比特币/i,
  ETH: /(?<![A-Za-z])(ETH|Ether|Ethereum)(?![A-Za-z])|以太坊|以太币/i,
  SOL: /(?<![A-Za-z])(SOL|Solana)(?![A-Za-z])/i,
  XRP: /(?<![A-Za-z])XRP(?![A-Za-z])|Ripple|瑞波/i,
  BNB: /(?<![A-Za-z])BNB(?![A-Za-z])/,
};
const MAX_ASSETS = 3;
/** A snapshot further than this from the moment it stands for is not used. */
const NEAR_MS = 6 * 3600_000;
const DAY_MS = 86400_000;

export interface PricePoint { priceUsdt: number; at: string; exchange: string }
export interface StoryAssetPrice { asset: SpotAsset; before: PricePoint; after: PricePoint & { latest: boolean }; changePercent: number }
export interface StoryMarket { eventAt: string; assets: StoryAssetPrice[] }

/** The assets named in the texts, most mentions first. */
export function assetsNamed(texts: string[]): SpotAsset[] {
  return SPOT_ASSETS
    .map((asset) => ({ asset, n: texts.filter((t) => NAMES[asset].test(t)).length }))
    .filter((a) => a.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, MAX_ASSETS)
    .map((a) => a.asset);
}

type Row = { price_usdt: string; observed_at: Date; exchange: string };
const point = (r: Row): PricePoint => ({ priceUsdt: Number(r.price_usdt), at: r.observed_at.toISOString(), exchange: r.exchange });

export async function storyMarket(storyId: number, now = new Date()): Promise<StoryMarket | null> {
  const reports = await sql<{ title: string; original_title: string | null; at: Date }[]>`
    SELECT p.title, p.original_title, coalesce(p.published_at, p.discovered_at) AS at
    FROM publications p JOIN sources s ON s.id = p.source_id
    WHERE p.story_id = ${storyId} AND ${storyReportCondition(now)}`;
  if (reports.length === 0) return null;
  const [story] = await sql<{ title: string }[]>`SELECT title FROM stories WHERE id = ${storyId}`;
  const assets = assetsNamed([story?.title ?? "", ...reports.flatMap((r) => [r.title, r.original_title ?? ""])]);
  return marketAround(assets, new Date(Math.min(...reports.map((r) => r.at.getTime()))), now);
}

/** The named assets priced just before `eventAt` and a day later (or at the latest snapshot while that day is not over). */
export async function marketAround(assets: SpotAsset[], eventAt: Date, now = new Date()): Promise<StoryMarket> {
  const dayLater = new Date(eventAt.getTime() + DAY_MS);
  const priced: StoryAssetPrice[] = [];
  for (const asset of assets) {
    const [before] = await sql<Row[]>`SELECT price_usdt, observed_at, exchange FROM market_snapshots
      WHERE asset = ${asset} AND observed_at <= ${eventAt} AND observed_at > ${new Date(eventAt.getTime() - NEAR_MS)}
      ORDER BY observed_at DESC LIMIT 1`;
    if (!before) continue;
    const latest = dayLater > now;
    const [after] = latest
      ? await sql<Row[]>`SELECT price_usdt, observed_at, exchange FROM market_snapshots
          WHERE asset = ${asset} AND observed_at > ${before.observed_at} ORDER BY observed_at DESC LIMIT 1`
      : await sql<Row[]>`SELECT price_usdt, observed_at, exchange FROM market_snapshots
          WHERE asset = ${asset} AND observed_at >= ${dayLater} AND observed_at < ${new Date(dayLater.getTime() + NEAR_MS)}
          ORDER BY observed_at LIMIT 1`;
    if (!after) continue;
    const b = point(before), a = point(after);
    priced.push({ asset, before: b, after: { ...a, latest }, changePercent: Number(((a.priceUsdt / b.priceUsdt - 1) * 100).toFixed(2)) });
  }
  return { eventAt: eventAt.toISOString(), assets: priced };
}
