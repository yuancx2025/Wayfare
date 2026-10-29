import React, { act } from "react";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { Linking, Text } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SavedPlaces from "../../../app/(tabs)/saved";
import SavedPlaceOverview from "../../../app/saved-place/[id]";
import Explore from "../../../app/(tabs)/explore";
import DestinationOverview from "../../../app/destination/[id]";
import { SavePlaceButton } from "@/components/SavePlaceButton";
import ActivityDetailSheet from "@/components/ActivityDetailSheet";
import { PlaceDetailsBody } from "@/components/SavedPlaceViews";
import { api } from "@/lib/api";
import { catalogSavedPlaceDetails } from "@/domain/logic/savedPlaces";
import { sampleTrip } from "@/lib/api/local";
import type { SavedPlace, SavedPlaceDetails } from "@/domain/types";
import { DESTINATIONS } from "@/domain/data/places";

jest.mock("react-native/Libraries/Components/Pressable/Pressable", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return { default: (props: object) => React.createElement("Pressable", props) };
});
jest.mock("@/lib/api", () => ({
  ApiError: jest.requireActual<typeof import("@/lib/api/types")>("@/lib/api/types").ApiError,
  api: { mode: "local", imageUrl: (src: string) => src, listSavedPlaces: jest.fn(), savePlace: jest.fn(), removeSavedPlace: jest.fn(), getSavedPlaceDetails: jest.fn(), placeDetails: jest.fn(), listDestinations: jest.fn(), resolveDestination: jest.fn() },
}));
jest.mock("expo-router", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return { useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]), router: { canGoBack: () => false, replace: jest.fn() } };
});
jest.mock("@/state/store", () => ({ useStore: () => ({ showToast: mockToast, startDraft: mockStartDraft }) }));
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
  return Object.fromEntries(["Button", "BottomSheet", "Spinner"].map((name) => [name, (props: { children?: React.ReactNode; footer?: React.ReactNode }) => name === "BottomSheet" ? React.createElement(name, props, props.children, props.footer) : React.createElement(name, props)]));
});

const mockApi = jest.mocked(api);
const mockRouter = { navigate: jest.fn(), push: jest.fn(), replace: jest.fn() };
const mockToast = jest.fn();
const mockStartDraft = jest.fn();
const mockParams = { id: "saved-1" };
const saved: SavedPlace = { provider: "catalog", kind: "place", externalId: "ny-met", id: "saved-1", createdAt: 10 };
let client: QueryClient;
let screen: ReactTestRenderer | undefined;
const hosts = (name: string) => screen!.root.findAll((node) => String(node.type) === name);
const buttons = () => hosts("Pressable").filter((node) => node.props.accessibilityRole === "button");
const text = (value: string) => screen!.root.findAllByType(Text).some((node) => node.props.children === value);
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
async function mount(element: React.ReactElement) {
  await act(async () => { screen = create(React.createElement(QueryClientProvider, { client }, element)); });
  await flush();
  await flush();
}
async function press(label: string) { await act(async () => { await buttons().find((node) => node.props.accessibilityLabel === label)!.props.onPress(); }); await flush(); }

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  mockApi.listSavedPlaces.mockReset().mockResolvedValue([saved]);
  mockApi.savePlace.mockReset().mockResolvedValue(saved);
  mockApi.removeSavedPlace.mockReset().mockResolvedValue(undefined);
  mockApi.getSavedPlaceDetails.mockReset();
  mockApi.placeDetails.mockReset();
  mockApi.listDestinations.mockReset().mockResolvedValue([DESTINATIONS[0]]);
  mockApi.resolveDestination.mockReset().mockResolvedValue(DESTINATIONS[0]);
  mockParams.id = saved.id;
});
afterEach(async () => { if (screen) await act(async () => screen!.unmount()); screen = undefined; client.clear(); jest.restoreAllMocks(); });

test("loading, failed reads and empty collection have distinct recoverable states", async () => {
  let fail!: (error: Error) => void;
  mockApi.listSavedPlaces.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
  await mount(React.createElement(SavedPlaces));
  expect(text("Loading your saved places…")).toBe(true);
  expect(text("Keep your next discovery close.")).toBe(false);
  await act(async () => { fail(new Error("Storage unavailable")); }); await flush();
  expect(text("Your saved places can wait.")).toBe(true);
  expect(text("Keep your next discovery close.")).toBe(false);
  mockApi.listSavedPlaces.mockResolvedValue([]);
  await act(async () => { hosts("Button").find((node) => node.props.children === "Try again")!.props.onPress(); }); await flush();
  expect(text("Keep your next discovery close.")).toBe(true);
  await act(async () => { hosts("Button").find((node) => node.props.children === "Explore destinations")!.props.onPress(); });
  expect(mockRouter.navigate).toHaveBeenCalledWith("/explore");
});

test("row navigation and removal are separate; removing the last item reveals empty", async () => {
  await mount(React.createElement(SavedPlaces));
  const main = buttons().find((node) => node.props.accessibilityLabel === "Open The Met")!;
  expect(main.findAllByType(SavePlaceButton)).toHaveLength(0);
  await press("Remove The Met from Saved");
  expect(mockApi.removeSavedPlace).toHaveBeenCalledWith(saved.id);
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(text("Keep your next discovery close.")).toBe(true);
  expect(mockToast).toHaveBeenCalledWith("Removed from Saved places");
});

test("a saved row opens its record-specific detail route", async () => {
  await mount(React.createElement(SavedPlaces));
  await press("Open The Met");
  expect(mockRouter.push).toHaveBeenCalledWith(`/saved-place/${saved.id}`);
});

test("a save pending in one control disables matching controls and errors retain the previous state", async () => {
  mockApi.listSavedPlaces.mockResolvedValue([]);
  let fail!: (error: Error) => void;
  mockApi.savePlace.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
  await mount(React.createElement(React.Fragment, null,
    React.createElement(SavePlaceButton, { reference: saved, name: "The Met" }),
    React.createElement(SavePlaceButton, { reference: saved, name: "The Met" }),
  ));
  await press("Save The Met to Saved");
  expect(buttons().every((button) => button.props.disabled && button.props.accessibilityState.busy)).toBe(true);
  await act(async () => { fail(new Error("Offline")); }); await flush();
  expect(buttons().every((button) => !button.props.accessibilityState.selected)).toBe(true);
  expect(mockToast).toHaveBeenCalledWith("Couldn't update Saved. Try again.");
  await press("Save The Met to Saved");
  expect(buttons().every((button) => button.props.accessibilityState.selected)).toBe(true);
});

test("unavailable details remain removable and retry can recover the actual provider content", async () => {
  const google = { ...saved, provider: "google" as const, externalId: "google-point-id" };
  mockApi.listSavedPlaces.mockResolvedValue([google]);
  mockApi.getSavedPlaceDetails.mockRejectedValueOnce(new Error("Provider unavailable"));
  await mount(React.createElement(SavedPlaceOverview));
  expect(text("Details are taking a break.")).toBe(true);
  expect(buttons().some((button) => button.props.accessibilityLabel === "Remove this place from Saved")).toBe(true);
  const details: SavedPlaceDetails = { reference: { provider: "google", kind: "place", externalId: "google-point-id" }, name: "The Met", subtitle: "Upper East Side", description: "Provider details" };
  mockApi.getSavedPlaceDetails.mockResolvedValueOnce(details);
  await act(async () => { hosts("Button").find((node) => node.props.children === "Try again")!.props.onPress(); }); await flush();
  expect(text("Provider details")).toBe(true);
  expect(text("Starts")).toBe(false);
  await press("Remove The Met from Saved");
  expect(mockRouter.replace).toHaveBeenCalledWith("/saved");
});

test("activity saving uses the resolved provider place ID, not the activity's map ID", async () => {
  mockApi.listSavedPlaces.mockResolvedValue([]);
  const activity = { ...sampleTrip().days[0].activities[0], id: "activity-render-id", placeId: "google-place-id" };
  mockApi.placeDetails.mockResolvedValue({ placeId: activity.placeId, name: "The Met", source: "google" });
  mockApi.savePlace.mockResolvedValue({ ...saved, provider: "google", externalId: activity.placeId });
  await mount(React.createElement(ActivityDetailSheet, { activity, number: 1, onClose: jest.fn() }));
  await press("Save The Met to Saved");
  expect(mockApi.savePlace).toHaveBeenCalledWith({ provider: "google", kind: "place", externalId: "google-place-id" });
});

test("failed external links give retry guidance", async () => {
  const details = catalogSavedPlaceDetails({ provider: saved.provider, kind: saved.kind, externalId: saved.externalId })!;
  const open = jest.spyOn(Linking, "openURL").mockRejectedValueOnce(new Error("No handler"));
  await mount(React.createElement(PlaceDetailsBody, { details, kind: "place" }));
  await act(async () => { hosts("Button").find((node) => node.props.children === "Open in Google Maps")!.props.onPress(); }); await flush();
  expect(open).toHaveBeenCalledWith(details.googleMapsUri);
  expect(mockToast).toHaveBeenCalledWith("Couldn't open this link. Try again.");
});

test("Explore separates saving from destination navigation and the existing planning action", async () => {
  mockApi.listSavedPlaces.mockResolvedValue([]);
  mockApi.savePlace.mockResolvedValue({ ...saved, kind: "destination", externalId: "nyc" });
  await mount(React.createElement(Explore));
  const main = buttons().find((button) => button.props.accessibilityLabel === "Open New York City destination")!;
  expect(main.findAllByType(SavePlaceButton)).toHaveLength(0);
  await press("Save New York City to Saved");
  expect(mockApi.savePlace).toHaveBeenCalledWith({ provider: "catalog", kind: "destination", externalId: "nyc" });
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(mockStartDraft).not.toHaveBeenCalled();
  await act(async () => { hosts("Button").find((node) => node.props.children === "Plan a Trip")!.props.onPress(); });
  expect(mockStartDraft).toHaveBeenCalledWith("New York City, New York", "nyc");
  expect(mockRouter.push).toHaveBeenLastCalledWith("/create");
  await press("Open New York City destination");
  expect(mockRouter.push).toHaveBeenLastCalledWith("/destination/nyc");
});

test("a destination with missing provenance remains browsable without a fabricated save reference", async () => {
  mockParams.id = "unresolved-city";
  mockApi.resolveDestination.mockResolvedValue({ ...DESTINATIONS[0], id: mockParams.id });
  await mount(React.createElement(DestinationOverview));
  expect(text("New York City")).toBe(true);
  expect(screen!.root.findAllByType(SavePlaceButton)).toHaveLength(0);
  expect(mockApi.savePlace).not.toHaveBeenCalled();
});
