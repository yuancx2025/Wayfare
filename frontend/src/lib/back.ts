import { router } from "expo-router";

/** Leaves the current screen. A trip opened with no history (right after generation, or a fresh web load) goes to Trips. */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/** Returns through navigation history, or opens the Profile overview. */
export function goBackToProfile() {
  if (router.canGoBack()) router.back();
  else router.replace("/profile");
}

export function goBackToSaved() {
  if (router.canGoBack()) router.back();
  else router.replace("/saved");
}

export function goBackToExplore() {
  if (router.canGoBack()) router.back();
  else router.replace("/explore");
}
