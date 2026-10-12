// Exports the TypeScript place catalog and planner outputs so the Python port can be tested for parity.
// Run from the repo root: node backend/scripts/export_ts_fixtures.mjs
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const domain = "/frontend/src/domain";
const server = await createServer({ root, configFile: false, logLevel: "error", server: { middlewareMode: true, hmr: false } });

try {
  const { DESTINATIONS } = await server.ssrLoadModule(`${domain}/data/places.ts`);
  const { buildTrip } = await server.ssrLoadModule(`${domain}/logic/generate.ts`);
  const { proposeAdjustment, replacementCandidates, proposeReplacement } = await server.ssrLoadModule(`${domain}/logic/adjust.ts`);

  const catalogPath = resolve(root, "backend/app/integrations/places/catalog.json");
  mkdirSync(dirname(catalogPath), { recursive: true });
  writeFileSync(catalogPath, JSON.stringify(DESTINATIONS, null, 2) + "\n");

  const drafts = [
    { dest: "nyc", startDate: "2030-05-04", endDate: "2030-05-08", travelers: 2,
      prefs: { pace: "balanced", interests: ["food", "culture", "museums", "nature"], food: ["street-food", "local-classics"], transport: "transit", budget: "moderate" } },
    { dest: "chicago", startDate: "2030-06-10", endDate: "2030-06-12", travelers: 1,
      prefs: { pace: "packed", interests: ["architecture", "nightlife", "food"], food: ["fine-dining", "cafes"], transport: "walking", budget: "premium" } },
    { dest: "seattle", startDate: "2030-07-01", endDate: "2030-07-04", travelers: 3,
      prefs: { pace: "relaxed", interests: ["nature", "shopping"], food: ["seafood", "vegetarian"], transport: "driving", budget: "budget" } },
    { dest: "nyc", startDate: "2030-09-20", endDate: "2030-09-21", travelers: 4,
      prefs: { pace: "packed", interests: ["nightlife", "shopping", "architecture"], food: ["cafes"], transport: "mix", budget: "budget" } },
  ];

  const cases = drafts.map((d, i) => {
    const dest = DESTINATIONS.find((x) => x.id === d.dest);
    const draft = { destination: dest.name, startDate: d.startDate, endDate: d.endDate, travelers: d.travelers, prefs: d.prefs, simulateFailure: false };
    const trip = buildTrip(`trip-case-${i}`, dest, draft);
    const adjustments = trip.days.map((day) => {
      const out = {};
      for (const kind of ["relaxed", "less-walking", "more-food"]) out[kind] = proposeAdjustment(trip, day.index, kind);
      const target = day.activities[0];
      const candidates = target ? replacementCandidates(trip, day.index, target.id) : [];
      out.replace = target ? {
        activityId: target.id,
        candidateIds: candidates.map((c) => c.id),
        proposal: candidates.length ? proposeReplacement(trip, day.index, target.id, candidates[0]) : null,
      } : null;
      return out;
    });
    return { destinationId: d.dest, draft, trip: { ...trip, createdAt: 0 }, adjustments };
  });

  const fixturesPath = resolve(root, "backend/tests/fixtures/ts_parity.json");
  mkdirSync(dirname(fixturesPath), { recursive: true });
  writeFileSync(fixturesPath, JSON.stringify(cases, null, 1) + "\n");
  console.log(`Wrote ${DESTINATIONS.length} destinations and ${cases.length} parity cases`);
} finally {
  await server.close();
}
