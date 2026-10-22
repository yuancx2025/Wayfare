import React, { act } from "react";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { router } from "expo-router";
import EditProfile from "../../../app/(tabs)/profile/edit";
import ProfilePreferences from "../../../app/(tabs)/profile/preferences";
import { DEFAULT_PREFS } from "@/domain/logic/labels";
import type { Preferences, ProfilePatch } from "@/domain/types";
import { useStore } from "@/state/store";
import { goBackToProfile } from "@/lib/back";

jest.mock("expo-router", () => ({
  router: { canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));
jest.mock("@/state/store", () => ({
  useStore: () => mockStore,
  errorMessage: (error: unknown) => error instanceof Error ? error.message : "Something went wrong",
}));
jest.mock("@/lib/api", () => jest.requireActual("@/lib/api/types"));
jest.mock("@/components/Icon", () => ({ Icon: () => null }));
jest.mock("@/components/PreferencesForm", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return function PreferencesForm(props: object) {
    return React.createElement("PreferencesForm", props);
  };
});
jest.mock("@/components/ui", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return Object.fromEntries(
    ["Button", "ErrorLine", "FieldInput", "FormField", "Spinner", "TopBar"].map((name) => [
      name, (props: object) => React.createElement(name, props),
    ]),
  );
});

let mockStore: Pick<ReturnType<typeof useStore>,
  "hydrated" | "loadError" | "defaultPrefs" | "refresh" | "saveDefaultPrefs" | "saveProfile" | "showToast" | "me"
>;
let screen: ReactTestRenderer;
const saveProfile = jest.fn<(patch: ProfilePatch) => Promise<void>>();
const saveDefaultPrefs = jest.fn<(prefs: Preferences) => Promise<void>>();
const relaxed: Preferences = { ...DEFAULT_PREFS, pace: "relaxed" };
const packed: Preferences = { ...DEFAULT_PREFS, pace: "packed" };

const hosts = (name: string) => screen.root.findAll((node) => node.type === name);
const button = (label: string) => hosts("Button").find((node) => node.props.children === label)!;
const preferences = () => hosts("PreferencesForm")[0];
const mount = async (component: typeof ProfilePreferences | typeof EditProfile) => {
  await act(async () => { screen = create(React.createElement(component)); });
};
const rerenderPreferences = async () => {
  await act(async () => { screen.update(React.createElement(ProfilePreferences)); });
};

beforeEach(() => {
  jest.clearAllMocks();
  saveProfile.mockReset().mockResolvedValue(undefined);
  saveDefaultPrefs.mockReset().mockResolvedValue(undefined);
  jest.mocked(router.canGoBack).mockReturnValue(false);
  mockStore = {
    hydrated: true, loadError: null, defaultPrefs: DEFAULT_PREFS,
    refresh: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    saveDefaultPrefs, saveProfile, showToast: jest.fn(),
    me: {
      id: "demo-user", name: "Alex Rivera", home: "Brooklyn, NY", initials: "AR",
      stats: { trips: 0, daysPlanned: 0, countries: 0 },
    },
  };
});

afterEach(async () => {
  if (screen) await act(async () => { screen.unmount(); });
});

test("preferences wait for hydration and initialize from loaded defaults", async () => {
  mockStore.hydrated = false;
  await mount(ProfilePreferences);
  expect(hosts("Spinner")).toHaveLength(1);
  expect(hosts("PreferencesForm")).toHaveLength(0);
  mockStore = { ...mockStore, hydrated: true, defaultPrefs: packed };
  await rerenderPreferences();
  expect(preferences().props.value).toEqual(packed);
});

test("preferences show a retry instead of an editor when loading fails", async () => {
  mockStore.loadError = "Couldn't load preferences";
  await mount(ProfilePreferences);
  expect(hosts("PreferencesForm")).toHaveLength(0);
  expect(hosts("ErrorLine")[0].props.message).toBe(mockStore.loadError);
  await act(async () => { button("Try again").props.onPress(); });
  expect(mockStore.refresh).toHaveBeenCalledTimes(1);
});

test("untouched preferences adopt updated defaults", async () => {
  await mount(ProfilePreferences);
  mockStore.defaultPrefs = relaxed;
  await rerenderPreferences();
  expect(preferences().props.value).toEqual(relaxed);
});

test("discard resets the baseline so later updates preserve new edits", async () => {
  await mount(ProfilePreferences);
  await act(async () => { preferences().props.onChange(packed); });
  mockStore.defaultPrefs = relaxed;
  await rerenderPreferences();
  expect(preferences().props.value).toEqual(packed);
  await act(async () => { button("Discard").props.onPress(); });
  expect(preferences().props.value).toEqual(relaxed);
  await act(async () => { preferences().props.onChange(DEFAULT_PREFS); });
  mockStore.defaultPrefs = packed;
  await rerenderPreferences();
  expect(preferences().props.value).toEqual(DEFAULT_PREFS);
});

test("failed preference saves preserve edits and show the error", async () => {
  saveDefaultPrefs.mockRejectedValueOnce(new Error("Storage is full"));
  await mount(ProfilePreferences);
  await act(async () => { preferences().props.onChange(packed); });
  await act(async () => { button("Save preferences").props.onPress(); });
  expect(saveDefaultPrefs).toHaveBeenCalledWith(packed);
  expect(preferences().props.value).toEqual(packed);
  expect(hosts("ErrorLine")[0].props.message).toBe("Storage is full");
});

test("keyboard submissions share one save and fields lock until it finishes", async () => {
  let finish!: () => void;
  saveProfile.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  await mount(EditProfile);
  await act(async () => { hosts("FieldInput")[0].props.onChangeText("  Sam Lee  "); });
  const done = hosts("FieldInput")[1].props.onSubmitEditing;
  await act(async () => { done(); done(); });
  expect(saveProfile).toHaveBeenCalledTimes(1);
  expect(saveProfile).toHaveBeenCalledWith({ name: "Sam Lee" });
  expect(hosts("FieldInput").every((field) => field.props.editable === false)).toBe(true);
  expect(router.replace).not.toHaveBeenCalled();
  await act(async () => { finish(); });
  expect(router.replace).toHaveBeenCalledWith("/profile");
  expect(hosts("FieldInput").every((field) => field.props.editable === true)).toBe(true);
});

test("validation failure releases the submit lock for a corrected retry", async () => {
  await mount(EditProfile);
  await act(async () => { hosts("FieldInput")[0].props.onChangeText("   "); });
  await act(async () => { hosts("FieldInput")[1].props.onSubmitEditing(); });
  expect(saveProfile).not.toHaveBeenCalled();
  await act(async () => { hosts("FieldInput")[0].props.onChangeText("Sam Lee"); });
  await act(async () => { hosts("FieldInput")[1].props.onSubmitEditing(); });
  expect(saveProfile).toHaveBeenCalledTimes(1);
});

test.each([true, false])("profile back navigation handles existing history: %s", (hasHistory) => {
  jest.mocked(router.canGoBack).mockReturnValue(hasHistory);
  goBackToProfile();
  expect(router.back).toHaveBeenCalledTimes(hasHistory ? 1 : 0);
  if (hasHistory) expect(router.replace).not.toHaveBeenCalled();
  else expect(router.replace).toHaveBeenCalledWith("/profile");
});
