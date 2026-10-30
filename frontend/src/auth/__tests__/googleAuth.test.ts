import { describe, expect, jest, test } from "@jest/globals";
import { interpretGoogleSignIn } from "../googleAuth";

jest.mock("@clerk/expo/experimental", () => ({ useSSO: () => ({ startSSOFlow: async () => ({}) }) }));

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
