# Wayfare first-day streaming benchmark

November 9, 2026 · Wayfare commit `e304efd`

The iPhone simulator prototype showed a readable Day 1 **0.97 seconds earlier at the paired median**. The final itinerary appeared at essentially the same time. This passed the test targets of at least 500 ms earlier first content and no more than 100 ms added to the median final-trip time. Live Gemini returned a Day 1 that survived full-trip validation in **4 of 8 streams**.

## Simulator A/B

| Trace | Pairs | Checklist first-day p50 | Preview first-day p50 | Paired median gain |
| --- | ---: | ---: | ---: | ---: |
| New York, 3 days | 5 | 2.40 s | 1.43 s | 0.97 s |
| San Francisco, 3 days | 5 | 2.20 s | 1.52 s | 0.68 s |
| New York, 7 days | 5 | 3.77 s | 2.32 s | 1.43 s |
| Overall | 15 | 2.40 s | 1.52 s | 0.97 s |

- All 15 preview runs rendered Day 1 before receiving `done`. The paired gain ranged from **0.65 to 1.47 s**. All 30 trials rendered the same final payload for their trace. The median paired change to final visibility was **−0.2 ms** (preview minus checklist). The largest added final time in this sample was **16.7 ms**.
- Retry injection rendered the provisional day, cleared it, then rendered the replacement and final plan. Cancellation after the first preview aborted the stream and showed no later day or final trip. These were two deterministic fault checks.
- Both arms used the same loopback HTTP stream, including the same event timing, chunk boundaries, and final payload. The checklist arm ignored the `day` event. Arm order alternated. Three synthetic itineraries used representative final timings from the baseline, with 0.70, 0.97, and 1.45 s of programmed preview lead. The 0.97 s profile used the observed pilot lead.
- The benchmark ran in Expo Go 57 on the iPhone 18 Pro simulator with iOS 27.0. The prototype reused Wayfare's SSE parser. Time started at each automated generation trigger. The render timestamp came from the card's native layout callback followed by two animation frames. The result covers a benchmark screen and a render proxy. Signed-in navigation and a user perception study were outside this test.

## Live model probe

Each of four prompts was run twice in both streaming and blocking modes using the same schema and Gemini 3.5 Flash-Lite free-tier key. The order alternated by pair. Inputs used the bundled catalog, with extra synthetic places in one seven-day case. The paired run used a 20 s deadline per call and five seconds minimum between call starts. It made zero Maps requests.

| Outcome | Streaming | Blocking |
| --- | ---: | ---: |
| Returned a complete structured response | 5/8 | 8/8 |
| Passed Wayfare's full-trip validation | 4/8 | 4/8 |
| Ended in a provider overload error or timed out | 3/8 | 0/8 |

Seven of eight streams exposed a locally valid Day 1. Four kept that day in a valid final plan. In those four, Day 1 was available **0.79 s median** before the full JSON arrived, with a **0.70–2.37 s** range. Three of the seven locally valid previews would have needed to be withdrawn after an overload, timeout, or full-trip rejection. A separate pilot, excluded from the paired figures, produced a 0.97 s lead after about 33 s to Day 1.

The prototype can use a provider lead to display itinerary content earlier. The live sample supports keeping previews provisional and handling withdrawal before rollout. A production latency claim needs a larger live comparison with the actual screen and the planner's retry and fallback path enabled.

## Reproduction and evidence

- From `backend/`, run `.venv/bin/python -m bench.streaming_probe PROBE.csv TRACES.json --repeats 2 --timeout 20` with a verified free-tier Gemini key and an upcoming trip date. Pass `--start-date` to set the date.
- From `backend/`, run `.venv/bin/python -m bench.streaming_replay INPUTS.json RESULT.json` using the [controlled replay inputs](raw/2026-11-09-replay-inputs.json) and a new output path. The server binds to 127.0.0.1:8765.
- In a temporary copy of `frontend/` with locked dependencies installed, set the package entry point to `./bench/streaming-replay.tsx`. Use a minimal Expo config without Wayfare's auth or Maps settings. Start with `NODE_OPTIONS=--dns-result-order=ipv4first npx expo start --go --localhost --port 8781 --no-dev --minify` and open `exp://127.0.0.1:8781` in the booted simulator. The test starts automatically and saves its result through the replay server.

[Simulator measurements](raw/2026-11-09-ios-replay.json) · [Live paired model data](raw/2026-11-09-streaming-probe.csv) · [Pilot data](raw/2026-11-09-streaming-pilot.csv) · [Original baseline](README.md)
