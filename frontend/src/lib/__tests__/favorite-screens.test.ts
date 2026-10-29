import React, { act } from "react";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { FlatList, Text } from "react-native";
import FavoriteTrips from "../../../app/(tabs)/profile/favorites";
import { FavoriteButton } from "@/components/FavoriteButton";
import { useStore } from "@/state/store";
import { sampleTrip, summarize } from "@/lib/api/local";

jest.mock("react-native/Libraries/Components/Pressable/Pressable", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return { default: (props: object) => React.createElement("Pressable", props) };
});
jest.mock("@/lib/api", () => ({ api: { imageUrl: (src: string) => src } }));
jest.mock("@/state/store", () => ({ useStore: () => mockStore }));
jest.mock("@/lib/useToday", () => ({ useToday: () => "2026-10-29" }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, router: { canGoBack: () => false, replace: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-image", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return { Image: (props: object) => React.createElement("Image", props) };
});
jest.mock("@/components/Icon", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return { Icon: (props: object) => React.createElement("Icon", props) };
});
jest.mock("@/components/ui", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return { Button: (props: object) => React.createElement("Button", props) };
});

const mockRouter = { navigate: jest.fn(), push: jest.fn() };
const trip = sampleTrip();
const saved = { ...summarize(trip), isFavorite: true };
let mockStore: Pick<ReturnType<typeof useStore>, "summaries" | "hydrated" | "refreshing" | "loadError" | "refresh" | "favoritePending" | "setTripFavorite" | "showToast">;
let screen: ReactTestRenderer;
const buttons = () => screen.root.findAll((node) => String(node.type) === "Button");
const pressables = () => screen.root.findAll((node) => typeof node.type === "string" && node.props.accessibilityRole === "button" && Boolean(node.props.onPress));
const hasText = (value: string) => screen.root.findAllByType(Text).some((node) => node.props.children === value);

async function mount(element: React.ReactElement) { await act(async () => { screen = create(element); }); }
beforeEach(() => {
  jest.clearAllMocks();
  mockStore = {
    summaries: [saved, { ...saved, id: "not-saved", isFavorite: false }], hydrated: true, refreshing: false, loadError: null,
    refresh: jest.fn<() => Promise<void>>().mockResolvedValue(undefined), favoritePending: {},
    setTripFavorite: jest.fn<(id: string, value: boolean) => Promise<void>>().mockResolvedValue(undefined), showToast: jest.fn(),
  };
});
afterEach(async () => { if (screen) await act(async () => screen.unmount()); });

test("the collection filters existing summaries and opens the owned trip", async () => {
  await mount(React.createElement(FavoriteTrips));
  const list = screen.root.findByType(FlatList);
  expect(list.props.data).toEqual([saved]);
  const card = pressables().find((node) => node.props.accessibilityLabel === `Open ${trip.destination} trip`)!;
  await act(async () => card.props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith(`/trip/${trip.id}`);
});

test("loading and failed reads never display the empty collection message", async () => {
  mockStore.hydrated = false;
  await mount(React.createElement(FavoriteTrips));
  expect(hasText("Loading your favorites…")).toBe(true);
  expect(hasText("Keep a good plan close.")).toBe(false);
  mockStore = { ...mockStore, hydrated: true, loadError: "No connection" };
  await act(async () => screen.update(React.createElement(FavoriteTrips)));
  expect(hasText("Your favorites can wait.")).toBe(true);
  expect(hasText("Keep a good plan close.")).toBe(false);
  await act(async () => buttons().find((node) => node.props.children === "Try again")!.props.onPress());
  expect(mockStore.refresh).toHaveBeenCalledTimes(1);
});

test("removing the last favorite reveals the empty state and a route back to Trips", async () => {
  await mount(React.createElement(FavoriteTrips));
  mockStore = { ...mockStore, summaries: [] };
  await act(async () => screen.update(React.createElement(FavoriteTrips)));
  expect(hasText("Keep a good plan close.")).toBe(true);
  await act(async () => buttons().find((node) => node.props.children === "Browse your trips")!.props.onPress());
  expect(mockRouter.navigate).toHaveBeenCalledWith("/");
});

test("the action disables across views while saving and keeps its committed state", async () => {
  mockStore.favoritePending[trip.id] = true;
  await mount(React.createElement(FavoriteButton, { trip }));
  const button = pressables()[0];
  expect(button.props.disabled).toBe(true);
  expect(button.props.accessibilityState).toMatchObject({ selected: false, busy: true });
  await act(async () => button.props.onPress());
  expect(mockStore.setTripFavorite).not.toHaveBeenCalled();
});

test("write failures retain the old heart, show retry guidance, and do not navigate", async () => {
  jest.mocked(mockStore.setTripFavorite).mockRejectedValueOnce(new Error("No connection"));
  await mount(React.createElement(FavoriteButton, { trip }));
  await act(async () => pressables()[0].props.onPress());
  expect(pressables()[0].props.accessibilityState.selected).toBe(false);
  expect(mockStore.showToast).toHaveBeenCalledWith("Couldn't save favorite. Try again.");
  expect(mockRouter.push).not.toHaveBeenCalled();
  await act(async () => pressables()[0].props.onPress());
  expect(mockStore.showToast).toHaveBeenLastCalledWith("Added to Favorite trips");
});

test("the heart and card navigation are sibling controls, so a save cannot open the trip", async () => {
  const { TripCard } = jest.requireActual<typeof import("@/components/trip")>("@/components/trip");
  const open = jest.fn();
  await mount(React.createElement(TripCard, { trip: saved, today: "2026-10-28", onPress: open }));
  const main = pressables().find((node) => node.props.accessibilityLabel === `Open ${trip.destination} trip`)!;
  expect(main.findAllByType(FavoriteButton)).toHaveLength(0);
  const favorite = pressables().find((node) => node.props.accessibilityLabel?.startsWith("Remove "))!;
  await act(async () => favorite.props.onPress());
  expect(mockStore.setTripFavorite).toHaveBeenCalledWith(trip.id, false);
  expect(open).not.toHaveBeenCalled();
});
