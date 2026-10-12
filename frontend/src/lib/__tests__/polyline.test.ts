import { describe, expect, test } from "@jest/globals";
import { decodePolyline } from "@/lib/polyline";

describe("decodePolyline", () => {
  test("decodes Google's reference example", () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });

  test("returns no points for an empty string", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});
