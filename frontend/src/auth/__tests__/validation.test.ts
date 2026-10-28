import { describe, expect, test } from "@jest/globals";
import { checkEmail, checkName, checkPassword, cleanCode } from "../validation";

describe("cleanCode", () => {
  test("keeps digits only and stops at six", () => {
    expect(cleanCode("123 456")).toBe("123456");
    expect(cleanCode("12-34-56-78")).toBe("123456");
    expect(cleanCode("ab1c2")).toBe("12");
    expect(cleanCode("")).toBe("");
  });
});

describe("checkEmail", () => {
  test("accepts a normal address, ignoring surrounding spaces", () => {
    expect(checkEmail(" you@example.com ")).toBeNull();
  });

  test("rejects empty and malformed addresses", () => {
    expect(checkEmail("")?.message).toBe("Enter your email address.");
    expect(checkEmail("you@example")?.message).toBe("Enter a valid email address.");
    expect(checkEmail("you example.com")?.field).toBe("email");
  });
});

describe("checkPassword", () => {
  test("only requires a value when signing in", () => {
    expect(checkPassword("short")).toBeNull();
    expect(checkPassword("")?.field).toBe("password");
  });

  test("enforces the minimum length for new passwords", () => {
    expect(checkPassword("short", { isNew: true })?.message).toBe("Use at least 8 characters.");
    expect(checkPassword("long enough", { isNew: true })).toBeNull();
  });
});

describe("checkName", () => {
  test("requires a non-blank name", () => {
    expect(checkName("   ")?.field).toBe("name");
    expect(checkName("Alex")).toBeNull();
  });
});
