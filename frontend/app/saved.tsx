import { Redirect } from "expo-router";

/** Keep existing Saved links working after moving the collection into Profile. */
export default function SavedRedirect() {
  return <Redirect href="/profile/saved" />;
}
