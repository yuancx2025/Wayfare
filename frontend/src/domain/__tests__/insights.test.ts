import { describe, expect, test } from "@jest/globals";
import { tripInsights } from "../logic/insights";
import type { Activity, Category, Trip } from "../types";

const stop = (placeId: string, category: Category): Activity => ({
  id: placeId, placeId, name: placeId, category, area: "", lat: 0, lng: 0, startMin: 540, durationMin: 60, description: "", why: "",
});
const trip = (id: string, destinationId: string, days: Activity[][]): Trip => ({
  id, destinationId, destination: destinationId, country: "", image: "", startDate: "2030-01-01", endDate: "2030-01-02",
  travelers: 1, adjusted: false, createdAt: 0, prefs: {} as Trip["prefs"],
  days: days.map((activities, index) => ({ index, date: "2030-01-01", theme: "", areas: "", startMin: 540, bufferMin: 15, activities })),
});

describe("tripInsights", () => {
  test("no trips gives zeros", () => {
    expect(tripInsights([])).toEqual({ trips: 0, days: 0, stops: 0, destinations: 0, topCategories: [] });
  });

  test("totals count every stop but categories count each place once", () => {
    const a = trip("a", "nyc", [[stop("met", "museums"), stop("pizza", "food")], [stop("park", "nature")]]);
    const b = trip("b", "nyc", [[stop("met", "museums"), stop("moma", "museums"), stop("bagel", "food")]]);
    const insights = tripInsights([a, b]);
    expect(insights).toMatchObject({ trips: 2, days: 3, stops: 6, destinations: 1 });
    expect(insights.topCategories).toEqual([
      { category: "food", places: 2 },
      { category: "museums", places: 2 },
      { category: "nature", places: 1 },
    ]);
  });

  test("keeps the top three, ties in alphabetical order", () => {
    const t = trip("t", "chicago", [[stop("1", "shopping"), stop("2", "culture"), stop("3", "nightlife"), stop("4", "architecture")]]);
    expect(tripInsights([t]).topCategories.map((c) => c.category)).toEqual(["architecture", "culture", "nightlife"]);
  });
});
