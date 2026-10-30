import { describe, expect, test } from "@jest/globals";
import { resolveMode } from "../mode";

describe("resolveMode", () => {
  test("waits until the guest choice has been read", () => {
    expect(resolveMode(true, false, null)).toBe("loading");
  });

  test("an active Clerk session always wins, even over a stale guest flag", () => {
    expect(resolveMode(true, true, null)).toBe("account");
    expect(resolveMode(true, true, true)).toBe("account");
  });

  test("guests don't wait for Clerk to load", () => {
    expect(resolveMode(false, false, true)).toBe("guest");
  });

  test("without guest mode, waits for Clerk before showing sign-in", () => {
    expect(resolveMode(false, false, false)).toBe("loading");
    expect(resolveMode(true, false, false)).toBe("signedOut");
  });
});
