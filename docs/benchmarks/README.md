# Wayfare generation baseline

November 9, 2026 · Wayfare commit `e304efd` · 54 measured generations

The API delivered and saved all 54 trips. With Gemini 3.5 Flash-Lite enabled, median time to the first itinerary content was **2.35 s**. Measured Gemini usage priced at standard list rates averaged **$0.0044 per delivered trip**, including retries. The live Gemini calls used a verified free-tier project. Google Maps calls were disabled.

## Latency and delivery

| Trip length | Runs per mode | Gemini median | Gemini range | Heuristic median | Gemini-curated | Mean Gemini list cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 9 | 1.29 s | 1.12–1.41 s | 5.2 ms | 9/9 | $0.0009 |
| 3 | 9 | 2.35 s | 1.97–12.78 s | 6.0 ms | 6/9 | $0.0032 |
| 7 | 9 | 13.71 s | 3.22–14.70 s | 5.8 ms | 3/9 | $0.0090 |

- Gemini mode reached its first progress event in 32.7 ms median and its final `done` event in 2.35 s median (1.12–14.70 s). The median cumulative time inside Gemini calls was 2.30 s per trip. Gemini accounted for 77% of aggregate observed request time.
- Heuristic mode reached its first progress event in 2.5 ms median and `done` in 5.8 ms median (4.5–31.4 ms).
- Gemini passed validation on the first attempt for **17/27** trips. It produced the delivered plan for **18/27**, with **9/27** falling back to the heuristic planner. The planner retried 10 requests and made 46 model attempts in total. There were 0 provider errors and 0 parse errors.
- Gemini-curated trips took 1.69 s median and trips that fell back took 13.71 s median. These groups contain different scenarios. The harness paced model-call starts at least five seconds apart to stay below the free-tier quota. Waits between requests are outside the timing window. A retry could add up to 5.92 s of measured wait within a request. Subtracting that wait gives a 2.35 s overall median and a 10.42 s median for seven-day trips. The table reports observed elapsed time.
- The bundled catalog supplied opening hours for 0 of 339 visits in Gemini mode. These runs provide no opening-hours accuracy measurement. In Gemini mode, 18 of 99 itinerary days lacked a lunch slot and 18 of 42 days where the chosen preferences called for dinner lacked a dinner slot.

The three-day New Orleans food scenario asks for six unique meal stops. The bundled catalog has five food candidates, and the validator requires both meals and disallows repeats in this case. All three runs used three model attempts before falling back. This is a case where checking feasibility before the model call could prevent retries.

## Cost

- **Gemini measured usage.** 57,013 input tokens, 40,297 billable output tokens including reasoning, and 0 cached input tokens. Standard list prices are $0.30 per million uncached input tokens and $2.50 per million output tokens. Estimated total for the 27 measured trips was $0.1178, with a median of $0.0023 per trip and a range of $0.0008–$0.0131. [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing/)
- **Maps modeled from the Gemini-mode itinerary shapes.** At global list prices, the modeled cold-cache Maps subtotal is **$0.53 median per trip** with a **$0.23–$1.06** range. Each scenario would issue five candidate searches at $0.04 each with the current field mask. For routing, the model groups observed legs by mode, splits them into chunks of at most 10, and charges $0.005 per matrix element. Each chunk of size k sends k origins and k destinations, for k² elements. Actual Maps candidate results, route choices, cache misses, and charges can differ. The estimate covers the generation endpoint with a known destination and excludes map rendering, photo requests, hosting, and free monthly allowances. [Places field masks](https://developers.google.com/maps/documentation/places/web-service/text-search) · [Routes billing](https://developers.google.com/maps/documentation/routes/usage-and-billing) · [Maps price list](https://developers.google.com/maps/billing-and-pricing/pricing)
- **Routing model since this run.** The app now sends one `computeRoutes` request per leg instead of a route matrix. `bench/baseline.py` therefore models one $0.005 request per distinct leg, in a `route_requests_if_uncached` column. The routing figures above and the raw CSVs use the old matrix model.

## Method and reproduction

- Python 3.12, Uvicorn 0.54.0, local PostgreSQL 14.20, and the repo's pinned LangChain Google adapter 4.4.0 on an Apple Silicon Mac. Both arms ran sequentially with the same bundled candidates and distance-estimated routes.
- Nine scenarios across five cities, each repeated three times per mode. Trips started Monday, December 7, 2026. Each API process got a heuristic warm-up. One additional live pilot was excluded.
- The runner sends signed test tokens through the existing auth path and uses a fresh idempotency key for each request. Client elapsed times run from POST to the corresponding SSE event on localhost. The runner also verifies that a follow-up GET returns the saved trip. The current first itinerary event is `done`.
- Use a fresh local PostgreSQL database named `wayfare_bench`, with `DATABASE_URL` set to its loopback URL. Run from `backend/` with the project's development dependencies installed. Confirm the configured Gemini key is on the free tier before the second benchmark invocation. Set an upcoming Monday with `--start-date` if the benchmark date has passed.

```sh
.venv/bin/python -m app.bootstrap.db init --seed
.venv/bin/python -m bench.baseline /tmp/wayfare-heuristic.csv --start-date 2026-12-07
.venv/bin/python -m bench.baseline /tmp/wayfare-gemini.csv --start-date 2026-12-07 --gemini
```

[Benchmark runner](../../backend/bench/baseline.py) · [Gemini run data](raw/2026-11-09-gemini.csv) · [Heuristic run data](raw/2026-11-09-heuristic.csv)

The timings cover the local API. Mobile rendering, Neon network latency, and live Maps latency were outside this run. The sample size supports descriptive medians and ranges.

## Verification

- Backend tests with disposable PostgreSQL and provider doubles, **94 passed**.
- Frontend tests from a clean copy with locked dependencies, **114 passed**. Expo lint and TypeScript checks passed.
