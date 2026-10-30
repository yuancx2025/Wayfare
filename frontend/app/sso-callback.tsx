import { useEffect } from "react";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useAuthSession } from "@/auth/session";

// Lets a web redirect finish the browser session. On native the sign-in screen's browser sheet does this itself.
WebBrowser.maybeCompleteAuthSession();

/** Landing route for travelcompanion://sso-callback. The sign-in screen completes the session. */
export default function SSOCallback() {
  const router = useRouter();
  const { mode } = useAuthSession();

  useEffect(() => {
    if (mode === "account" || mode === "guest") router.replace("/");
  }, [mode, router]);

  return null;
}
