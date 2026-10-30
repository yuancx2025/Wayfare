import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { continueSignIn } from "../emailAuth";

// Hoisted above the imports, so loading emailAuth does not load the real Clerk SDK.
jest.mock("@clerk/expo", () => ({ useSignIn: () => null, useSignUp: () => null }));

/** Only the fields continueSignIn reads. */
function attempt(status: string) {
  return {
    status,
    finalize: jest.fn(async (): Promise<{ error: unknown }> => ({ error: null })),
    supportedSecondFactors: [{ strategy: "email_code" }],
    mfa: { sendEmailCode: jest.fn(async () => ({ error: null })) },
  };
}

describe("continueSignIn", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("a completed password sign-in activates the session and stops there", async () => {
    const signIn = attempt("complete");
    await expect(continueSignIn(signIn as never)).resolves.toEqual({ kind: "signed-in" });
    expect(signIn.finalize).toHaveBeenCalledTimes(1);
    expect(signIn.mfa.sendEmailCode).not.toHaveBeenCalled();
  });

  test("a new device is not asked for an email code", async () => {
    const signIn = attempt("needs_client_trust");
    const step = await continueSignIn(signIn as never);
    expect(step.kind).toBe("error");
    expect(signIn.mfa.sendEmailCode).not.toHaveBeenCalled();
    expect(signIn.finalize).not.toHaveBeenCalled();
  });

  test("a failed session activation is reported instead of treated as signed in", async () => {
    const signIn = attempt("complete");
    signIn.finalize.mockResolvedValueOnce({ error: { errors: [{ code: "too_many_requests", message: "Slow down" }] } });
    await expect(continueSignIn(signIn as never)).resolves.toMatchObject({
      kind: "error",
      error: { field: "form" },
    });
  });
});
