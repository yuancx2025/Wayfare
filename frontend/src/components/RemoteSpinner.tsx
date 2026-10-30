import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { WAKING_AFTER_MS, spinnerLabel } from "@/lib/waking";

function useWaking(active: boolean) {
  const [past, setPast] = useState(false);
  if (!active && past) setPast(false);
  useEffect(() => {
    if (!active || past) return;
    const id = setTimeout(() => setPast(true), WAKING_AFTER_MS);
    return () => clearTimeout(id);
  }, [active, past]);
  return active && past;
}

/** The ordinary label, then the waking copy once a remote load has been waiting. */
export function RemoteSpinner({ label }: { label: string }) {
  const api = useApi();
  const waking = useWaking(api.mode === "remote");
  return <Spinner label={spinnerLabel(label, api.mode === "remote", waking ? WAKING_AFTER_MS : 0)} />;
}
