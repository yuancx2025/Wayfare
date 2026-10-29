import { describe, expect, test } from "@jest/globals";
import { DESTINATIONS } from "@/domain/data/places";
import { MAX_NEARBY_RADIUS_M, rankNearby } from "@/domain/logic/nearby";

const catalog = DESTINATIONS.flatMap((d) => d.places);
const loop = { lat: 41.8796, lng: -87.6237 }; // Art Institute of Chicago

describe("rankNearby", () => {
  test("keeps places inside the radius, nearest first", () => {
    const near = rankNearby(catalog, loop);
    const distances = near.map((n) => n.distanceM);
    expect(near[0].place.name).toBe("Art Institute of Chicago");
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(Math.max(...distances)).toBeLessThanOrEqual(2000);
    expect(near.length).toBeLessThanOrEqual(20);
    expect(rankNearby(catalog, { ...loop, radiusM: MAX_NEARBY_RADIUS_M }).length).toBeGreaterThan(near.length);
  });

  test("filters by category", () => {
    const food = rankNearby(catalog, { ...loop, category: "food" });
    expect(food.length).toBeGreaterThan(0);
    expect(new Set(food.map((n) => n.place.category))).toEqual(new Set(["food"]));
    expect(rankNearby(catalog, { ...loop, category: "attractions" }).some((n) => n.place.category === "food")).toBe(false);
  });

  test("never presents distant catalog places as nearby", () => {
    expect(rankNearby(catalog, { lat: 39.0, lng: -98.0, radiusM: MAX_NEARBY_RADIUS_M })).toEqual([]);
  });
});
