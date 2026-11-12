# Maps cache benchmark

November 11, 2026 · branch `perf/maps-cache` · 60 simulated users against a local fake Google

With the 6-hour cache, 60 simulated users needed **925 Google requests instead of 2,021 (−54%)**. Their list cost fell from **$0.48 to $0.22 per user (−53%)**, and **60%** of cache lookups were hits.

These numbers come from a local stand-in for Google. They measure how often the app repeats a Google request, priced at Google's list rates. They don't measure what real Google returns or bills. A small live run to confirm the billing hasn't been done yet (see [Live check](#live-check-not-run-yet)).

## What the cache stores

Everything lives in the `place_cache` table in Postgres. It's shared by all users and server processes.

| Cache | Key | Used by | Kept for |
| --- | --- | --- | --- |
| Candidate text searches | query, location bias, page size | trip generation | 6 h |
| Route legs | travel mode and both stops (to about 1 m) | generation, day map, edits | 6 h |
| Nearby searches | point (to about 11 m), radius, place types | alternatives, "more food" edit | 6 h |
| Place details | place ID | place sheet | 6 h |
| Photo lookups | place ID | trip image | 6 h |
| Photo URLs | photo name, width | trip image | 10 min |
| Destination details | place ID | resolving a destination | 6 h |
| Shown alternatives | trip, day, stop | reused when the user picks a replacement | 6 h |

The app doesn't cache map tiles. On iOS the map is Apple Maps, which draws and caches its own tiles.

## Results at the 6-hour TTL

| Cache | Lookups | Hits | Misses | Hit rate |
| --- | ---: | ---: | ---: | ---: |
| Route legs (computeRoutes) | 971 | 640 | 331 | 66% |
| Candidate text searches | 268 | 162 | 106 | 60% |
| Nearby searches (edits) | 180 | 68 | 112 | 38% |
| Photo lookups | 120 | 97 | 23 | 81% |
| Photo URLs | 120 | 19 | 101 | 16% |
| Place details | 116 | 50 | 66 | 43% |
| Shown alternatives (reused on replace) | 60 | 60 | 0 | 100% |
| Destination details | 6 | 0 | 6 | 0% |
| **All** | **1,841** | **1,096** | **745** | **60%** |

| Google requests | SKU | No cache | Cache | Saved | List cost, no cache | List cost, cache |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Candidate text searches | Text Search Enterprise + Atmosphere | 268 | 106 | 162 | $10.72 | $4.24 |
| Nearby searches (edits) | Nearby Search Enterprise + Atmosphere | 180 | 112 | 68 | $7.20 | $4.48 |
| Route legs | Compute Routes Essentials | 971 | 331 | 640 | $4.85 | $1.65 |
| Place details | Place Details Enterprise + Atmosphere | 176 | 66 | 110 | $4.40 | $1.65 |
| Photo URLs | Place Details Photos | 120 | 101 | 19 | $0.84 | $0.71 |
| Autocomplete (not cached) | Autocomplete Requests | 180 | 180 | 0 | $0.51 | $0.51 |
| Destination details | Place Details Enterprise + Atmosphere | 6 | 6 | 0 | $0.15 | $0.15 |
| Photo lookups | Place Details Essentials (IDs Only) | 120 | 23 | 97 | $0.00 | $0.00 |
| **All** | | **2,021** | **925** | **1,096** | **$28.67** | **$13.39** |

What drives these numbers:
- **Day maps** found 86% of their legs in the cache, because generating the trip had already fetched them, polyline included. The misses were return visits after the 6-hour TTL had run out.
- **Text searches** hit 60%. Users planning the same city with the same preferences send the same five searches. New York had 27 of the 60 users.
- **Place details** saved 110 requests. 60 came from replacements that reused the alternatives the user had just been shown, and 50 from repeat lookups of the same place.
- **Photo URLs** hit only 16%. Google's photo URLs are short-lived, so they're kept for 10 minutes.
- **Destination details** never hit. After the first lookup, each destination is saved in the database, so later users never reach the cache.
- **Autocomplete** can't be cached. It costs $0.51 of the $13.39.

## TTL comparison

The same 60 users, replayed with different cache lifetimes:

| TTL | Hit rate | Google requests | List cost per user | Versus no cache |
| --- | ---: | ---: | ---: | ---: |
| No cache | – | 2,021 | $0.48 | – |
| 1 h | 36% | 1,353 | $0.34 | −28% |
| **6 h (current)** | **60%** | **925** | **$0.22** | **−53%** |
| 24 h | 75% | 633 | $0.13 | −73% |

The 24-hour row is for comparison only. Google's terms limit how long most Places and Routes content may be kept.

## Latency (simulated)

Every fake Google call waited 100 ms, so these numbers show how many Google round trips each step makes, not real Google latency.

| Step | Calls | p50, no cache | p50, cache | p95, no cache | p95, cache |
| --- | ---: | ---: | ---: | ---: | ---: |
| Open a day's map | 272 | 109 ms | 7 ms | 112 ms | 117 ms |
| Trip image | 120 | 207 ms | 112 ms | 209 ms | 220 ms |
| Replace preview | 60 | 215 ms | 116 ms | 220 ms | 125 ms |
| "More food" preview | 60 | 314 ms | 222 ms | 322 ms | 336 ms |
| Generate trip | 60 | 223 ms | 228 ms | 232 ms | 246 ms |
| Place details | 116 | 107 ms | 108 ms | 110 ms | 115 ms |

Generation doesn't get faster at the median. It sends its five searches at once and then its legs at once. One miss in either batch still costs a full Google round trip, and most trips had at least one miss.

## Free monthly allowances

The costs above are before Google's free monthly allowances. The two most expensive SKUs here, the Enterprise + Atmosphere text and nearby searches, include 1,000 free requests a month. At 60 users a day the app would use up the text-search allowance on about day 4 without the cache and about day 10 with it. After that, every request is billed and the saving above applies.

## Method

- **App:** the real FastAPI app over HTTP, with Google Places and Routes, the production `PlaceCache`, and no LLM. The heuristic planner makes both arms produce the same trips.
- **Fake Google** ([`bench/fake_google.py`](../../backend/bench/fake_google.py)):
  - It answers every endpoint the app calls, using the bundled catalog, and trims each response to the request's field mask.
  - Searches return catalog places matching the query's city and category.
  - Routes use straight-line distance × 1.3 at a fixed speed per travel mode.
- **Billing** ([`bench/maps_metering.py`](../../backend/bench/maps_metering.py)):
  - Each request is classified by endpoint and field mask. The most expensive field in the mask sets the tier.
  - It's priced at the first paid band of the [Maps price list](https://developers.google.com/maps/billing-and-pricing/pricing), using the [field tiers](https://developers.google.com/maps/documentation/places/web-service/data-fields). Both were checked on 2026-11-11.
- **Users** ([`bench/maps_cache.py`](../../backend/bench/maps_cache.py)):
  - 60 users start at random times over 24 simulated hours (seed 11).
  - Cities follow a Zipf-like popularity: New York 27, Chicago 11, San Francisco 10, Seattle, New Orleans and Washington 4 each.
  - Preferences come from three sets, and trips are 1, 3 or 7 days long.
- **Each user's journey,** following `frontend/src/lib/api/remote.ts`:
  1. Three autocomplete keystrokes.
  2. Resolve the destination.
  3. Generate the trip.
  4. Load the trip image and open every day's map.
  5. Open two places' details.
  6. View alternatives for a stop, preview replacing it, preview "more food", and apply that preview.
  7. Between 1 and 12 hours later: load the trip image and open day 1's map again.
- **Arms:** "No cache" uses a cache that never returns or stores anything. Each arm starts from an empty database with the same users.
- **Time:** the cache's clock is simulated, so entries expire on the simulated timeline. Visits run one at a time. Two users missing the same entry at the same moment isn't modeled.
- **Not modeled:** variation in real Google results, client-side caching (React Query in memory, `expo-image` on disk, and the `max-age=300` on photo redirects), and free allowances.

## Checks

The run fails unless all of these hold:
- Both arms produce identical itineraries, maps, details and edit previews.
- In each arm, Google requests of each kind equal that kind's cache misses.
- Both arms make the same cache lookups, apart from Place Details lookups replaced by reused alternatives.

## Live check (not run yet)

`live` mode sends two users planning the same 1-day trip to real Google. The cache is on and the run stops at 60 requests, which is at most $2.40 at list prices. Expected: the second user's searches and route legs make no Google requests.

Afterwards, compare the counted requests by SKU with Cloud Console's per-method metrics and the billing report by SKU. Things to confirm:
- the field-mask tiers
- that transit `computeRoutes` bills as Essentials
- whether autocomplete bills per request or per session

## Reproduce

From `backend/`, with a disposable local database whose name ends in `_bench`:

```bash
createdb -h localhost wayfare_maps_bench
DATABASE_URL=postgresql://localhost/wayfare_maps_bench .venv/bin/python -m bench.maps_cache run OUT.csv --ttl-hours 6 --google-latency-ms 100
.venv/bin/python -m bench.maps_cache report OUT.csv --summary SUMMARY.csv
```

The 1-hour and 24-hour runs drop `--google-latency-ms 100`. Seed 11 makes request and cache counts repeat exactly; timings vary a little between runs. The per-request CSVs (about 0.9 MB each) aren't committed. The summary below holds each run's totals by request kind and, for the 6-hour run, latency by step.

[Run summary: 1, 6 and 24-hour TTL](raw/2026-11-11-maps-cache-summary.csv) · [Generation baseline](README.md)
