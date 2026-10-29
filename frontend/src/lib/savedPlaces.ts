import { useMutation, useMutationState, useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { SavedPlace, SavedPlaceDetails, SavedPlaceReference } from "@/domain/types";
import { catalogSavedPlaceDetails, savedPlaceKey } from "@/domain/logic/savedPlaces";
import { api, ApiError } from "@/lib/api";

// Account integration must add the auth owner's scope and clear caches on scope changes.
export const savedPlacesQueryKey = ["saved-places", api.mode] as const;
const detailsKey = (id: string) => ["saved-place-details", api.mode, id] as const;
const writeKey = (reference: SavedPlaceReference) => ["saved-place-write", api.mode, savedPlaceKey(reference)] as const;
const writes = new WeakMap<QueryClient, Map<string, { saved: boolean; promise: Promise<void> }>>();

export function useSavedPlaces() {
  return useQuery({
    queryKey: savedPlacesQueryKey,
    queryFn: async ({ signal }) => {
      const items = await api.listSavedPlaces();
      if (signal.aborted) throw new Error("Collection read cancelled");
      return items;
    },
    retry: false,
    staleTime: 30_000,
  });
}

/** Confirmed writes only. Cancel older reads before and after the request to protect the cache. */
export function setPlaceSaved(client: QueryClient, reference: SavedPlaceReference, saved: boolean): Promise<void> {
  let pending = writes.get(client);
  if (!pending) { pending = new Map(); writes.set(client, pending); }
  const key = savedPlaceKey(reference);
  const active = pending.get(key);
  if (active) return active.saved === saved ? active.promise : active.promise.catch(() => undefined).then(() => setPlaceSaved(client, reference, saved));
  const promise = (async () => {
    await client.cancelQueries({ queryKey: savedPlacesQueryKey, exact: true });
    const snapshot = client.getQueryData<SavedPlace[]>(savedPlacesQueryKey);
    if (!snapshot) throw new Error("Load saved places before changing the collection.");
    const existing = snapshot.find((item) => savedPlaceKey(item) === key);
    let result: SavedPlace | undefined;
    if (saved) result = await api.savePlace({ provider: reference.provider, kind: reference.kind, externalId: reference.externalId });
    else if (existing) {
      try { await api.removeSavedPlace(existing.id); }
      catch (error) { if (!(error instanceof ApiError && error.status === 404)) throw error; }
    }
    await client.cancelQueries({ queryKey: savedPlacesQueryKey, exact: true });
    client.setQueryData<SavedPlace[]>(savedPlacesQueryKey, (current) => {
      // Leave an absent cache absent; authenticated scope handling is a separate integration.
      if (!current) return current;
      const rest = current.filter((item) => savedPlaceKey(item) !== key);
      return (result ? [result, ...rest] : rest).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    });
    if (!saved && existing) client.removeQueries({ queryKey: detailsKey(existing.id), exact: true });
  })().finally(() => pending.delete(key));
  pending.set(key, { saved, promise });
  return promise;
}

export function usePlaceSave(reference: SavedPlaceReference) {
  const client = useQueryClient();
  const collection = useSavedPlaces();
  const key = savedPlaceKey(reference);
  const entry = collection.data?.find((item) => savedPlaceKey(item) === key);
  const pending = useMutationState({ filters: { mutationKey: writeKey(reference), exact: true, status: "pending" }, select: () => true }).length > 0;
  const mutation = useMutation({ mutationKey: writeKey(reference), mutationFn: (saved: boolean) => setPlaceSaved(client, reference, saved), retry: false });
  return { collection, entry, pending, setSaved: mutation.mutateAsync };
}

function detailOptions(saved: SavedPlace | undefined) {
  const reference = saved ? { provider: saved.provider, kind: saved.kind, externalId: saved.externalId } : undefined;
  return {
    queryKey: detailsKey(saved?.id ?? ""),
    enabled: Boolean(saved),
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<SavedPlaceDetails> => {
      const details = await api.getSavedPlaceDetails(saved!.id);
      if (signal.aborted) throw new Error("Place details read cancelled");
      if (savedPlaceKey(details.reference) !== savedPlaceKey(saved!)) throw new ApiError(502, "Place details belong to a different reference.");
      return details;
    },
    initialData: reference ? catalogSavedPlaceDetails(reference) ?? undefined : undefined,
    staleTime: 5 * 60_000,
    retry: false,
  };
}

export const useSavedPlaceDetails = (saved: SavedPlace | undefined) => useQuery(detailOptions(saved));
export const useSavedPlaceDetailList = (items: SavedPlace[]) => useQueries({ queries: items.map(detailOptions) });
