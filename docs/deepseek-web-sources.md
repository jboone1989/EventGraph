# DeepSeek Search/Fetch source fallback

## Scope

Use for selected, high-value market-relevant political, military, sanctions or supply-chain sources **without a stable official feed or API**. This is not a website spider. DeepSeek returns original URLs discovered by search; EventGraph's existing `json_list`, filters, dedup and receipts process them. Keep the original publisher attribution; neither a snippet nor a search ranking proves an event happened. Do not create source-specific HTML/CSS scraping rules.

**Status:** Adapter developed in an isolated branch; not configured as active source or deployed until its tests, API credentials and a finite service budget have been validated on cn-dev.

## Example source

Configure in the existing source admin as `kind: json_list`, `tier: T2` (a discovery source), and a `hot_signal` or carefully curated `editorial` participation mode:

```json
{
  "mode": "deepseek_search",
  "deepseekQuery": "site:ofac.treasury.gov/recent-actions sanctions after:2026-10-01",
  "deepseekCount": 5,
  "allowUrlPrefixes": ["https://ofac.treasury.gov/recent-actions/"],
  "_aihot": { "initialBackfillLimit": 2 }
}
```

Use an appropriate interval such as 120 minutes, not a sub-minute polling loop. An explicit prefix is mandatory; cross-domain matches are excluded. Use *publication dates from the result*; an undated match is not automatically fresh. Adjust domain scope and query based on real results, not solely HTTP status.

For occasional detail fetches, add `detail: { "maxFetches": 1, "fetchVia": "deepseek" }`. Prefer not to fetch every search hit. Date extraction is not inferred from page prose: when necessary configure an explicit `publishedAtRegex` based on the source's published date. Do not use HTML-only detail selectors (`summarySelector`, `titleSelector`, `publishedAtSelector`) with DeepSeek Markdown Fetch; the config validator rejects them. When no configured field can use a detail result, Fetch is skipped without charge. If this approach is unreliable for a publisher, omit it rather than adding a bespoke scraper.

## Credential, cost and rollout

- The DeepSeek API key and optional base URL are read from the existing **models credential group** (`DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`) or the environment; no duplicate collectors credential file is needed. Never put a key into a source config or logs.
- **Before use, the operator must create a separate `budgets` record for service `deepseek_web` via existing admin budget management**, with explicit finite positive per-minute, per-hour and per-day request limits. This is separate from the model's `deepseek` budget. With a missing, zero or disabled budget the adapter intentionally stops without making a request.
- Official price at time of integration: **CNY 5 per 1,000 successful Search calls** and **CNY 5 per 1,000 successful Fetch calls** (estimate CNY 0.005/call). Charges depend on the provider's actual invoice. Cached receipt answers are reused within the request key's window. DeepSeek Fetch caches page-specific 403/404 refusals and empty-content 200 responses for the UTC day, **without treating them as completed detail extraction**; account-wide 401/402 errors fail the request and are retried after credentials or billing are repaired. This avoids repeated requests for inaccessible or useless pages.
- Start with one narrow source using admin preview; verify source URLs, freshness, dedup, receipt status and cost before enabling periodic collection. No historical replay or full-site crawling.
- Search and Fetch API behavior must be verified with a real, low-volume call before production. A passing mock test alone is insufficient.
- Source HTML licensing, robots/access terms and content redistribution restrictions continue to apply even when a third party fetches the page.

DeepSeek is a retrieval tool, not a primary official evidence source. Verify material claims from original publishers. For highest urgency (earthquake warning or sanctions changes) use direct official APIs/Atom/RSS where available: search-index latency cannot guarantee immediate or exhaustive monitoring.
