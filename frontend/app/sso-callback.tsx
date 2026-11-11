import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { pendingGoogleSignIn } from "@/auth/googleAuth";
import { useAuthSession } from "@/auth/session";

// On web this page loads inside Google's popup. Completing hands the result to the sign-in page, and the popup closes.
const completion = WebBrowser.maybeCompleteAuthSession();

/**
 * Landing route for travelcompanion://sso-callback. Android can open it on top of the sign-in screen while that
 * screen's Google sign-in is still finishing. Signed in, the user goes into the app. Otherwise they go back to the
 * form, which shows any error.
 */
export default function SSOCallback() {
  const router = useRouter();
  const { mode } = useAuthSession();
  const [flow] = useState(pendingGoogleSignIn);
  // True once no Google sign-in is left that could still sign the user in.
  const [returnToForm, setReturnToForm] = useState(flow === null);

  useEffect(() => {
    if (!flow) return;
    let active = true;
    void flow.then((step) => {
      if (active && step.kind !== "signed-in") setReturnToForm(true);
    });
    return () => {
      active = false;
    };
  }, [flow]);

  useEffect(() => {
    if (completion.type === "success") return;
    if (mode === "account") {
      router.replace("/");
    } else if (returnToForm) {
      if (router.canGoBack()) router.back();
      else router.replace(mode === "guest" ? "/" : "/sign-in");
    }
  }, [mode, returnToForm, router]);

  return null;
}
