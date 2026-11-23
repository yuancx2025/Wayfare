import React, { act } from "react";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TravelInsights from "../../../app/(tabs)/profile/insights";
import { DEFAULT_PREFS } from "@/domain/logic/labels";
import type { Insights } from "@/domain/types";

const getInsights = jest.fn<() => Promise<Insights>>();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }), router: { canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock("@/lib/api", () => ({ useApi: () => mockApi }));
jest.mock("@/state/store", () => ({
  useStore: () => mockStore,
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : "Something went wrong"),
}));
jest.mock("@/components/ui", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return Object.fromEntries(
    ["Button", "EmptyState", "ErrorLine", "SectionHeading", "Spinner", "TopBar"].map((name) => [
      name, (props: object) => React.createElement(name, props),
    ]),
  );
});

const mockApi = { getInsights };
const mockStore = { me: { id: "demo-user" }, defaultPrefs: DEFAULT_PREFS };
let screen: ReactTestRenderer;

// React Query publishes results on a zero-delay timer.
const settle = () => act(() => new Promise<void>((resolve) => { setTimeout(resolve, 0); }));
const mount = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await act(async () => {
    screen = create(React.createElement(QueryClientProvider, { client }, React.createElement(TravelInsights)));
  });
  await settle();
};
const host = (name: string) => screen.root.findAll((n) => n.type === name);
const texts = () => host("Text").map((n) => [n.props.children].flat().join(""));

beforeEach(() => { jest.clearAllMocks(); });
afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

test("shows planned totals, top categories, and the preference summary", async () => {
  getInsights.mockResolvedValue({
    trips: 2, days: 6, stops: 1, destinations: 2,
    topCategories: [{ category: "food", places: 4 }, { category: "museums", places: 2 }],
  });
  await mount();
  const shown = texts();
  expect(shown).toEqual(expect.arrayContaining(["2", "trips planned", "6", "days planned", "1", "stop planned", "destinations planned"]));
  expect(shown).toEqual(expect.arrayContaining(["Food", "4 places", "Museums", "2 places"]));
  expect(host("SectionHeading").map((n) => n.props.eyebrow)).toContain("Based on your preferences");
  expect(shown.some((t) => t.startsWith("A balanced pace"))).toBe(true);
});

test("no trips shows an empty state that starts planning", async () => {
  getInsights.mockResolvedValue({ trips: 0, days: 0, stops: 0, destinations: 0, topCategories: [] });
  await mount();
  const [empty] = host("EmptyState");
  expect(empty.props.title).toBe("No trips yet");
  empty.props.action.props.onPress();
  expect(mockPush).toHaveBeenCalledWith("/create");
});

test("a failed load can be retried", async () => {
  getInsights.mockRejectedValueOnce(new Error("Server unavailable"));
  await mount();
  expect(host("ErrorLine")[0].props.message).toBe("Server unavailable");
  getInsights.mockResolvedValueOnce({ trips: 1, days: 1, stops: 3, destinations: 1, topCategories: [] });
  await act(async () => { host("Button")[0].props.onPress(); });
  await settle();
  expect(getInsights).toHaveBeenCalledTimes(2);
  expect(host("ErrorLine")).toHaveLength(0);
  expect(texts()).toContain("trip planned");
});
