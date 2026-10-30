export const WAKING_AFTER_MS = 4000;

/** Shown when an account's first request is still running. A free host is often asleep. */
export const WAKING_SERVER = "Waking the server. The first request after it has been idle can take a minute.";

export function spinnerLabel(label: string, remote: boolean, waitedMs: number): string {
  return remote && waitedMs >= WAKING_AFTER_MS ? WAKING_SERVER : label;
}
