import { expect, test } from "@jest/globals";
import { WAKING_AFTER_MS, WAKING_SERVER, spinnerLabel } from "@/lib/waking";

test("a remote load that is still waiting names the sleeping server", () => {
  expect(spinnerLabel("Loading your trips", true, WAKING_AFTER_MS - 1)).toBe("Loading your trips");
  expect(spinnerLabel("Loading your trips", true, WAKING_AFTER_MS)).toBe(WAKING_SERVER);
});

test("guest loads never mention the server", () => {
  expect(spinnerLabel("Loading your trips", false, WAKING_AFTER_MS * 2)).toBe("Loading your trips");
});
