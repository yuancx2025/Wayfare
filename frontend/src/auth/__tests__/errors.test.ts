import { describe, expect, test } from "@jest/globals";
import { describeAuthError, messageFor } from "../errors";

/** Builds an object shaped like a Clerk API response error. */
const clerkError = (code: string, extra: { message?: string; longMessage?: string; paramName?: string } = {}) => ({
  errors: [{ code, message: extra.message ?? "Clerk message", longMessage: extra.longMessage, meta: { paramName: extra.paramName } }],
});

describe("describeAuthError", () => {
  test("uses Wayfare wording for known codes and assigns the right field", () => {
    expect(describeAuthError(clerkError("form_password_incorrect"))).toEqual({
      field: "password",
      message: "That password isn't right. Try again or reset it.",
    });
    expect(describeAuthError(clerkError("form_identifier_exists")).field).toBe("email");
    expect(describeAuthError(clerkError("form_code_incorrect")).field).toBe("code");
    expect(describeAuthError(clerkError("verification_expired")).field).toBe("code");
  });

  test("falls back to Clerk's message and maps the field from paramName", () => {
    expect(describeAuthError(clerkError("some_new_code", { longMessage: "Long text", paramName: "email_address" }))).toEqual({
      field: "email",
      message: "Long text",
    });
    expect(describeAuthError(clerkError("some_new_code", { message: "Short text" }))).toEqual({
      field: "form",
      message: "Short text",
    });
  });

  test("treats errors without a Clerk error list as a connection problem", () => {
    expect(describeAuthError(new Error("Network request failed")).field).toBe("form");
    expect(describeAuthError(undefined).message).toMatch(/connection/);
    expect(describeAuthError({ errors: [] }).message).toMatch(/connection/);
  });
});

describe("messageFor", () => {
  test("returns the message only for the matching field", () => {
    const error = { field: "email" as const, message: "Enter your email address." };
    expect(messageFor(error, "email")).toBe("Enter your email address.");
    expect(messageFor(error, "password")).toBeUndefined();
    expect(messageFor(null, "email")).toBeUndefined();
  });
});
