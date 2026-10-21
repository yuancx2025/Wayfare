import React, { act } from "react";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { create } from "react-test-renderer";
import * as Location from "expo-location";
import { LocationProvider, useCurrentLocation, type CurrentLocation } from "@/state/location";

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  hasServicesEnabledAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock("react-native", () => ({ Linking: { openSettings: jest.fn() } }));

const loc = Location as jest.Mocked<typeof Location>;
const perm = (granted: boolean, canAskAgain = true, extra: object = {}) =>
  ({ granted, canAskAgain, status: granted ? "granted" : "denied", expires: "never", ...extra }) as unknown as Location.LocationPermissionResponse;
const fix = { coords: { latitude: 41.8796, longitude: -87.6237 } } as Location.LocationObject;

function mountHook() {
  const result: { current?: CurrentLocation } = {};
  function Probe() {
    result.current = useCurrentLocation();
    return null;
  }
  act(() => { create(React.createElement(LocationProvider, null, React.createElement(Probe))); });
  return result as { current: CurrentLocation };
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.useRealTimers();
  loc.hasServicesEnabledAsync.mockResolvedValue(true);
});

test("does nothing until asked, then asks once and returns a position", async () => {
  loc.getForegroundPermissionsAsync.mockResolvedValue(perm(false));
  loc.requestForegroundPermissionsAsync.mockResolvedValue(perm(true));
  loc.getCurrentPositionAsync.mockResolvedValue(fix);
  const hook = mountHook();
  expect(hook.current.status).toBe("idle");
  expect(loc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  await act(() => hook.current.locate());
  expect(loc.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(hook.current.status).toBe("ready");
  expect(hook.current.position).toEqual({ lat: 41.8796, lng: -87.6237 });
  expect(hook.current.approximate).toBe(false);
});

test("separates a one-time denial from 'don't ask again'", async () => {
  loc.getForegroundPermissionsAsync.mockResolvedValue(perm(false));
  loc.requestForegroundPermissionsAsync.mockResolvedValue(perm(false, true));
  const hook = mountHook();
  await act(() => hook.current.locate());
  expect(hook.current.status).toBe("denied");

  loc.getForegroundPermissionsAsync.mockResolvedValue(perm(false, false));
  await act(() => hook.current.locate());
  expect(hook.current.status).toBe("blocked");
  expect(loc.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled();
});

test("reports disabled location services without asking for permission", async () => {
  loc.hasServicesEnabledAsync.mockResolvedValue(false);
  const hook = mountHook();
  await act(() => hook.current.locate());
  expect(hook.current.status).toBe("off");
  expect(loc.getForegroundPermissionsAsync).not.toHaveBeenCalled();
});

test("flags approximate locations on both platforms", async () => {
  loc.getCurrentPositionAsync.mockResolvedValue(fix);
  for (const extra of [{ ios: { accuracy: "reduced" } }, { android: { accuracy: "coarse" } }]) {
    loc.getForegroundPermissionsAsync.mockResolvedValue(perm(true, true, extra));
    const hook = mountHook();
    await act(() => hook.current.locate());
    expect(hook.current.approximate).toBe(true);
  }
});

test("gives up on a position that never arrives", async () => {
  jest.useFakeTimers();
  loc.getForegroundPermissionsAsync.mockResolvedValue(perm(true));
  loc.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
  const hook = mountHook();
  let pending!: Promise<void>;
  act(() => { pending = hook.current.locate(); });
  await act(async () => { await jest.advanceTimersByTimeAsync(15000); await pending; });
  expect(hook.current.status).toBe("timeout");
});

test("a stuck permission check also times out instead of spinning forever", async () => {
  jest.useFakeTimers();
  loc.getForegroundPermissionsAsync.mockReturnValue(new Promise(() => {}));
  const hook = mountHook();
  let pending!: Promise<void>;
  act(() => { pending = hook.current.locate(); });
  await act(async () => { await jest.advanceTimersByTimeAsync(5000); await pending; });
  expect(hook.current.status).toBe("timeout");
});

test("a failed read is reported as an error", async () => {
  loc.getForegroundPermissionsAsync.mockResolvedValue(perm(true));
  loc.getCurrentPositionAsync.mockRejectedValue(new Error("kCLErrorDomain"));
  const hook = mountHook();
  await act(() => hook.current.locate());
  expect(hook.current.status).toBe("error");
});

test("screens share one fix instead of each asking again", async () => {
  loc.getForegroundPermissionsAsync.mockResolvedValue(perm(true));
  loc.getCurrentPositionAsync.mockResolvedValue(fix);
  const seen: { a?: CurrentLocation; b?: CurrentLocation } = {};
  function A() { seen.a = useCurrentLocation(); return null; }
  function B() { seen.b = useCurrentLocation(); return null; }
  act(() => { create(React.createElement(LocationProvider, null, React.createElement(A), React.createElement(B))); });
  await act(() => seen.a!.locate());
  expect(seen.b!.status).toBe("ready");
  expect(seen.b!.position).toEqual({ lat: 41.8796, lng: -87.6237 });
  expect(loc.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
});
