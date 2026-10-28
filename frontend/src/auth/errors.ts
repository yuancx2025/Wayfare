/** Which part of a form an error belongs to; "form" errors show under the submit button. */
export type AuthField = "name" | "email" | "password" | "code" | "form";

export interface AuthFormError {
  field: AuthField;
  message: string;
}

/** Wayfare wording for the Clerk error codes users are most likely to hit. */
const KNOWN_ERRORS: Record<string, AuthFormError> = {
  form_identifier_not_found: { field: "email", message: "No account uses this email. Check it or create an account." },
  form_password_incorrect: { field: "password", message: "That password isn't right. Try again or reset it." },
  form_identifier_exists: { field: "email", message: "An account already uses this email. Sign in instead." },
  form_password_pwned: { field: "password", message: "This password appeared in a data breach. Choose a different one." },
  form_password_length_too_short: { field: "password", message: "Use at least 8 characters." },
  form_password_not_strong_enough: { field: "password", message: "Choose a stronger password." },
  form_param_format_invalid: { field: "email", message: "Enter a valid email address." },
  form_code_incorrect: { field: "code", message: "That code isn't right. Check the email and try again." },
  verification_expired: { field: "code", message: "This code has expired. Send a new one." },
  verification_failed: { field: "code", message: "Too many incorrect attempts. Send a new code." },
  too_many_requests: { field: "form", message: "Too many attempts. Wait a minute and try again." },
  strategy_for_user_invalid: { field: "form", message: "This account doesn't use a password. Try another sign-in method." },
};

/** Clerk names the field an error belongs to with `meta.paramName`. */
const PARAM_FIELDS: Record<string, AuthField> = {
  identifier: "email",
  email_address: "email",
  password: "password",
  code: "code",
  first_name: "name",
};

const NETWORK_ERROR: AuthFormError = {
  field: "form",
  message: "Couldn't reach the sign-in service. Check your connection and try again.",
};

interface ClerkApiError {
  code: string;
  message: string;
  longMessage?: string;
  meta?: { paramName?: string };
}

/** Clerk API failures carry an `errors` array; anything else is treated as a network problem. */
function firstApiError(error: unknown): ClerkApiError | undefined {
  if (!error || typeof error !== "object" || !("errors" in error)) return undefined;
  const list = (error as { errors: unknown }).errors;
  return Array.isArray(list) && list.length > 0 ? (list[0] as ClerkApiError) : undefined;
}

/** Turns an error returned by a Clerk sign-in/sign-up call into a message for the form. */
export function describeAuthError(error: unknown): AuthFormError {
  const apiError = firstApiError(error);
  if (!apiError) return NETWORK_ERROR;
  const known = KNOWN_ERRORS[apiError.code];
  if (known) return known;
  const field = PARAM_FIELDS[apiError.meta?.paramName ?? ""] ?? "form";
  return { field, message: apiError.longMessage ?? apiError.message };
}

/** The message to show under one field, if the current error belongs to it. */
export function messageFor(error: AuthFormError | null, field: AuthField): string | undefined {
  return error?.field === field ? error.message : undefined;
}
