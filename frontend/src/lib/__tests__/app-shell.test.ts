import React, { act } from "react";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { create, type ReactTestRenderer } from "react-test-renderer";
import type { QueryClient } from "@tanstack/react-query";
import type { AuthMode } from "@/auth/mode";
import RootLayout from "../../../app/_layout";

const mockSession: { mode: AuthMode; userId: string | null } = { mode: "signedOut", userId: null };
const mockClients = new Set<QueryClient>();
let mockClient: QueryClient;
let screen: ReactTestRenderer | undefined;

jest.mock("@/config", () => ({ CLERK_PUBLISHABLE_KEY: "pk_test_app_shell" }));
jest.mock("@clerk/expo", () => ({ ClerkProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));
jest.mock("@/auth/session", () => ({
  AuthSessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuthSession: () => mockSession,
}));
jest.mock("@/lib/api", () => ({ ApiProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("@/state/store", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    StoreProvider: ({ children }: { children: React.ReactNode }) => React.createElement("StoreScope", null, children),
    useStore: () => ({ toast: null }),
  };
});
jest.mock("@/state/tripSession", () => ({ TripSessionProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("@/state/locationPermission", () => ({ LocationPermissionProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("@/state/location", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const context = React.createContext(false);
  return {
    LocationProvider: ({ children }: { children: React.ReactNode }) => React.createElement(context.Provider, { value: true }, children),
    useCurrentLocation: () => {
      if (!React.useContext(context)) throw new Error("Missing location provider for active screens");
    },
  };
});
jest.mock("expo-router", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { useQueryClient } = jest.requireActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  function Stack({ children }: { children: React.ReactNode }) {
    const client = useQueryClient();
    jest.requireMock<{ useCurrentLocation: () => void }>("@/state/location").useCurrentLocation();
    mockClient = client;
    mockClients.add(client);
    return React.createElement("NavigationStack", null, children);
  }
  Stack.Protected = function Protected({ guard, children }: { guard: boolean; children: React.ReactNode }) { return guard ? children : null; };
  Stack.Screen = function Screen({ name }: { name: string }) { return React.createElement("Screen", { name }); };
  return { Stack, DefaultTheme: { colors: {} }, ThemeProvider: ({ children }: { children: React.ReactNode }) => children };
});
jest.mock("react-native-gesture-handler", () => ({ GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("@expo-google-fonts/manrope", () => ({ useFonts: () => [true, null], Manrope_700Bold: 1, Manrope_800ExtraBold: 1 }));
jest.mock("@expo-google-fonts/dm-sans", () => ({ DMSans_400Regular: 1, DMSans_500Medium: 1, DMSans_600SemiBold: 1, DMSans_700Bold: 1 }));
jest.mock("expo-splash-screen", () => ({ preventAutoHideAsync: async () => undefined, hideAsync: async () => undefined }));
jest.mock("@/components/ui", () => ({ Toast: () => null }));

const routes = () => screen!.root.findAll((node) => String(node.type) === "Screen").map((node) => node.props.name);
async function render() {
  await act(async () => {
    const element = React.createElement(RootLayout);
    if (screen) screen.update(element);
    else screen = create(element);
  });
}
beforeEach(() => { mockSession.mode = "signedOut"; mockSession.userId = null; });
afterEach(async () => {
  if (screen) await act(async () => screen!.unmount());
  screen = undefined;
  for (const client of mockClients) client.clear();
  mockClients.clear();
});

test("startup renders one navigation stack and one data scope with location available", async () => {
  await render();
  expect(screen!.root.findAll((node) => String(node.type) === "NavigationStack")).toHaveLength(1);
  expect(screen!.root.findAll((node) => String(node.type) === "StoreScope")).toHaveLength(1);
  expect(routes()).toEqual(["(auth)"]);
});

test("collection routes are available to guests and removed on sign-out", async () => {
  mockSession.mode = "guest";
  await render();
  expect(routes()).toEqual(["(tabs)", "create", "trip/[id]", "destination/[id]", "saved-place/[id]", "(auth)"]);
  mockSession.mode = "signedOut";
  await render();
  expect(routes()).toEqual(["(auth)"]);
});

test("switching accounts replaces their query cache and excludes auth screens", async () => {
  mockSession.mode = "account"; mockSession.userId = "user_a";
  await render();
  const previous = mockClient;
  previous.setQueryData(["private-trip"], { id: "trip-a" });
  mockSession.userId = "user_b";
  await render();
  expect(mockClient).not.toBe(previous);
  expect(mockClient.getQueryData(["private-trip"])).toBeUndefined();
  expect(routes()).not.toContain("(auth)");
});
