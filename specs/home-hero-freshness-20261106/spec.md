# Home Hero freshness (2026-11-06)

## Goal
The homepage hero must not be pinned to the 48-hour event hot ranking. Show one noteworthy, recent selected news article without extra model calls.

## Behavior
- Query public, eligible, released, selected **news** with an original published timestamp in the past 24 hours and a nonempty title and summary.
- Prefer candidates published in the last six hours; within that group choose highest existing selection score, then newest publication. If none exist in six hours, use the same ordering over the remaining day.
- Never revive an older article or replace an empty 24-hour result with a stale hot story; show the existing site intro.
- The hero links to the article detail page, using an English headline/summary when available; connect the right-hand graph to the article story when one exists.
- Keep the independent heat ranking unchanged and show its full top five underneath the hero.
- Cache the hero API for 30 seconds and the shared SSR frame for 60 seconds; no periodic model call or new scheduler.

## Acceptance
- Hidden, unselected, ineligible, non-news, future and older-than-24h articles cannot be featured.
- A recent high-scored selected article wins; a 6-hour candidate beats an older one; a missing English copy is handled without mislabeling Chinese as English.
- When all candidates age out, the hero displays the site introduction, not an old hot leader.

