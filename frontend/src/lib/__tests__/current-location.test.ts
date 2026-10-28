import React, { act } from "react";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { create } from "react-test-renderer";
import * as Location from "expo-location";
import { AppState } from "react-native";
import { LocationProvider, useCurrentLocation, type CurrentLocation } from "@/state/location";
import { LocationPermissionProvider } from "@/state/locationPermission";

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  hasServicesEnabledAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock("react-native", () => ({
  Linking: { openSettings: jest.fn() },
  AppState: { addEventListener: jest.fn() },
}));

const loc = Location as jest.Mocked<typeof Location>;
const appState = AppState as unknown as { addEventListener: jest.Mock };
type Status = "granted" | "denied" | "undetermined";
const perm = (status: Status, canAskAgain = true, extra: object = {}) =>
  ({ granted: status === "granted", canAskAgain, status, expires: "never", ...extra }) as unknown as Location.LocationPermissionResponse;
const fix = { coords: { latitude: 41.8796, longitude: -87.6237 } } as Location.LocationObject;

function Providers({ children }: { children: React.ReactNode }) {
  return React.createElement(LocationPermissionProvider, null, React.createElement(LocationProvider, null, children));
}

function Probe({ onRender }: { onRender: (loc: CurrentLocation) => void }) {
  onRender(useCurrentLocation());
  return null;
}

async function mountHook() {
  const result = {} as { current: CurrentLocation };
  const onRender = (loc: CurrentLocation) => { result.current = loc; };
  await act(async () => { create(React.createElement(Providers, null, React.createElement(Probe, { onRender }))); });
  return result;
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.useRealTimers();
  loc.hasServicesEnabledAsync.mockResolvedValue(true);
  appState.addEventListener.mockReturnValue({ remove: jest.fn() });
});

test("startup only checks permission silently: no prompt, no GPS", async () => {
  loc.getForegroundPermissionsAsync.mockResolvedValue(perm("granted"));
  const hook = await mountHook();
  expect(loc.getForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(loc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(hook.current.permission).toBe("granted");
  expect(hook.current.status).toBe("idle");
  expect(hook.current.position).toBeNull();
});

test("a 'don't ask again' choice is known before the user taps anything", async () => {
  loc.getForegroundPermissionsAsync.mockResolvedValue(perm("denied", false));
  const hook = await mountHook();
  expect(hook.current.permission).toBe("blocked");
  expect(hook.current.problem?.settings).toBe(true);
  expect(loc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
});

test("asks once when tapped, then returns a position", async () => {
  loc.getForegroundPermissionsAsync.mockResolvedValue(perm("undetermined"));
  loc.requestForegroundPermissionsAsync.mockResolvedValue(perm("granted"));
  loc.getCurrentPositionAsync.mockResolvedValue(fix);
  const hook = await mountHook();
  await act(() => hook.current.locate());
  expect(loc.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(hook.current.status).toBe("ready");
  expect(hook.current.position).toEqual({ lat: 41.8796, lng: -87.6237 });
  expect(hook.current.approximate).toBe(false);
});

test("separates a one-time denial from 'don't ask again'", async () => {
  loc.getForegroundPermissionsAsync.mockResolvedValue(perm("undetermined"));
  loc.requestForegroundPermissionsAsync.mockResolvedValue(perm("denied", true));
  const hook = await mountHook();
  await act(() => hook.current.locate());
  expect(hook.current.permission).toBe("denied");
  expect(hook.current.problem?.settings).toBeUndefined();

  loc.getForegroundPermissionsAsync.mockResolvedValue(perm("denied", false));
  await act(() => hook.current.locate());
  expect(hook.current.permission).toBe("blocked");
  expect(loc.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled();
});

test("returning from Settings re-checks, and a revoked permission hides the last position", async () => {
  loc.getForegroundPermissionsAsync.mockResolvedValue(perm("granted"));
  loc.getCurrentPositionAsync.mockResolvedValue(fix);
  const hook = await mountHook();
  await act(() => hook.current.locate());
  expect(hook.current.position).not.toBeNull();

  const onChange = appState.addEventListener.mock.calls[0][1] as (s: string) => void;
  loc.getForegroundPermissionsAsync.mockResolvedValue(perm("denied", false));
  await act(async () => { onChange("active"); });
  expect(hook.current.permission).toBe("blocked");
  expect(hook.current.position).toBeNull();
  expect(hook.current.status).toBe("idle");
});

test("reports disabled location services without asking for permission", async () => {
  loc.getForegroundPermissionsAsync.mockResolvedValue(perm("undetermined"));
  loc.hasServicesEnabledAsync.mockResolvedValue(false);
  const hook = await mountHook();
  await act(() => hook.current.locate());
  expect(hook.current.status).toBe("off");
  expect(hook.current.problem?.title).toBe("Location Services are off");
  expect(loc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
});

test("flags approximate locations on both platforms", async () => {
  loc.getCurrentPositionAsync.mockResolvedValue(fix);
  for (const extra of [{ ios: { accuracy: "reduced" } }, { android: { accuracy: "coarse" } }]) {
    loc.getForegroundPermissionsAsync.mockResolvedValue(perm("granted", true, extra));
    const hook = await mountHook();
    await act(() => hook.current.locate());
    expect(hook.current.approximate).toBe(true);
  }
});

test("gives up on a position that never arrives", async () => {
  jest.useFakeTimers();
  loc.getForegroundPermissionsAsync.mockResolvedValue(perm("granted"));
  loc.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
  const hook = await mountHook();
  let pending!: Promise<void>;
  act(() => { pending = hook.current.locate(); });
  await act(async () => { await jest.advanceTimersByTimeAsync(15000); await pending; });
  expect(hook.current.status).toBe("timeout");
});

test("a stuck permission check does not spin forever; tapping can still ask", async () => {
  jest.useFakeTimers();
  loc.getForegroundPermissionsAsync.mockReturnValue(new Promise(() => {}));
  loc.requestForegroundPermissionsAsync.mockResolvedValue(perm("granted"));
  loc.getCurrentPositionAsync.mockResolvedValue(fix);
  const hook = await mountHook();
  await act(async () => { await jest.advanceTimersByTimeAsync(5000); });
  expect(hook.current.permission).toBe("undetermined");
  let pending!: Promise<void>;
  act(() => { pending = hook.current.locate(); });
  await act(async () => { await jest.advanceTimersByTimeAsync(5000); await pending; });
  expect(hook.current.status).toBe("ready");
});

test("a failed read is reported as an error", async () => {
  loc.getForegroundPermissionsAsync.mockResolvedValue(perm("granted"));
  loc.getCurrentPositionAsync.mockRejectedValue(new Error("kCLErrorDomain"));
  const hook = await mountHook();
  await act(() => hook.current.locate());
  expect(hook.current.status).toBe("error");
});

test("screens share one fix instead of each asking again", async () => {
  loc.getForegroundPermissionsAsync.mockResolvedValue(perm("granted"));
  loc.getCurrentPositionAsync.mockResolvedValue(fix);
  const seen = {} as { a: CurrentLocation; b: CurrentLocation };
  await act(async () => {
    create(React.createElement(Providers, null,
      React.createElement(Probe, { onRender: (loc) => { seen.a = loc; } }),
      React.createElement(Probe, { onRender: (loc) => { seen.b = loc; } })));
  });
  await act(() => seen.a.locate());
  expect(seen.b.status).toBe("ready");
  expect(seen.b.position).toEqual({ lat: 41.8796, lng: -87.6237 });
  expect(loc.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
});
