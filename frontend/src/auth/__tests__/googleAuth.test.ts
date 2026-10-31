import { describe, expect, jest, test } from "@jest/globals";
import * as AuthSession from "expo-auth-session";
import { googleRedirectUrl, interpretGoogleSignIn, pendingGoogleSignIn, signInWithGoogle } from "../googleAuth";

jest.mock("@clerk/expo/experimental", () => ({ useSSO: () => ({ startSSOFlow: async () => ({}) }) }));
jest.mock("expo-auth-session", () => ({ makeRedirectUri: jest.fn(() => "travelcompanion://sso-callback") }));

type StartSSOFlow = Parameters<typeof signInWithGoogle>[0];
type SSOResult = Awaited<ReturnType<StartSSOFlow>>;

describe("interpretGoogleSignIn", () => {
  test("a created session is signed in", () => {
    expect(interpretGoogleSignIn({
      createdSessionId: "sess_1",
      authSessionResult: { type: "success" },
    })).toEqual({ kind: "signed-in" });
  });

  test.each(["cancel", "dismiss"])("closing the sheet (%s) stays on the form", (type) => {
    expect(interpretGoogleSignIn({ createdSessionId: null, authSessionResult: { type } })).toEqual({ kind: "cancelled" });
  });

  test("a finished sheet with no session is an error", () => {
    expect(interpretGoogleSignIn({ createdSessionId: null, authSessionResult: { type: "success" } })).toMatchObject({
      kind: "error",
      error: { field: "form" },
    });
  });
});

describe("googleRedirectUrl", () => {
  test("uses the app scheme and the callback route", () => {
    expect(googleRedirectUrl()).toBe("travelcompanion://sso-callback");
    expect(AuthSession.makeRedirectUri).toHaveBeenCalledWith({ scheme: "travelcompanion", path: "sso-callback" });
  });
});

describe("signInWithGoogle", () => {
  test("stays pending for the callback screen until the flow settles", async () => {
    let finish: (result: SSOResult) => void = () => undefined;
    const startSSOFlow = jest.fn<StartSSOFlow>(() => new Promise((resolve) => { finish = resolve; }));

    const flow = signInWithGoogle(startSSOFlow);
    expect(pendingGoogleSignIn()).toBe(flow);
    expect(startSSOFlow).toHaveBeenCalledWith({ strategy: "oauth_google", redirectUrl: "travelcompanion://sso-callback" });

    finish({ createdSessionId: "sess_1", authSessionResult: { type: "success", url: "travelcompanion://sso-callback" } });
    await expect(flow).resolves.toEqual({ kind: "signed-in" });
    await Promise.resolve();
    expect(pendingGoogleSignIn()).toBeNull();
  });

  test("a thrown Clerk error comes back as a form error and clears the pending flow", async () => {
    const startSSOFlow = jest.fn<StartSSOFlow>(async () => { throw new Error("network down"); });

    await expect(signInWithGoogle(startSSOFlow)).resolves.toMatchObject({ kind: "error" });
    await Promise.resolve();
    expect(pendingGoogleSignIn()).toBeNull();
  });
});
