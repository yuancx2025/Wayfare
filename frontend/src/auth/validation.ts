import type { AuthFormError } from "./errors";

export const CODE_LENGTH = 6;
export const MIN_PASSWORD_LENGTH = 8;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Keeps only digits, so pasted codes like "123 456" still work. */
export function cleanCode(text: string): string {
  return text.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

// Quick checks before calling Clerk, so obvious mistakes don't need a network round trip.
// Each returns null when the value is fine.

export function checkName(name: string): AuthFormError | null {
  return name.trim() ? null : { field: "name", message: "Enter your name." };
}

export function checkEmail(email: string): AuthFormError | null {
  const value = email.trim();
  if (!value) return { field: "email", message: "Enter your email address." };
  if (!EMAIL.test(value)) return { field: "email", message: "Enter a valid email address." };
  return null;
}

/** New passwords must meet the length rule; existing ones only need to be present. */
export function checkPassword(password: string, { isNew = false } = {}): AuthFormError | null {
  if (!password) return { field: "password", message: "Enter your password." };
  if (isNew && password.length < MIN_PASSWORD_LENGTH) {
    return { field: "password", message: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  return null;
}
