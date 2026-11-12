import { useMutation, useMutationState, useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { SavedPlace, SavedPlaceDetails, SavedPlaceReference } from "@/domain/types";
import { catalogSavedPlaceDetails, savedPlaceKey } from "@/domain/logic/savedPlaces";
import { useApi, ApiError, type Api } from "@/lib/api";
import { useAuthSession } from "@/auth/session";

export function useCollectionScope(): string {
  const { mode, userId } = useAuthSession();
  return mode === "account" ? `account:${userId}` : "guest";
}
export const savedPlacesQueryKey = (scope: string) => ["saved-places", scope] as const;
const detailsKey = (scope: string, id: string) => ["saved-place-details", scope, id] as const;
const writeKey = (scope: string, reference: SavedPlaceReference) => ["saved-place-write", scope, savedPlaceKey(reference)] as const;
const writes = new WeakMap<QueryClient, Map<string, { saved: boolean; promise: Promise<void> }>>();

export function useSavedPlaces() {
  const api = useApi();
  const scope = useCollectionScope();
  return useQuery({
    queryKey: savedPlacesQueryKey(scope),
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
export function setPlaceSaved(client: QueryClient, api: Api, scope: string, reference: SavedPlaceReference, saved: boolean): Promise<void> {
  let pending = writes.get(client);
  if (!pending) { pending = new Map(); writes.set(client, pending); }
  const referenceKey = savedPlaceKey(reference);
  const key = JSON.stringify([scope, referenceKey]);
  const active = pending.get(key);
  if (active) return active.saved === saved ? active.promise : active.promise.catch(() => undefined).then(() => setPlaceSaved(client, api, scope, reference, saved));
  const promise = (async () => {
    await client.cancelQueries({ queryKey: savedPlacesQueryKey(scope), exact: true });
    const snapshot = client.getQueryData<SavedPlace[]>(savedPlacesQueryKey(scope));
    if (!snapshot) throw new Error("Load saved places before changing the collection.");
    const existing = snapshot.find((item) => savedPlaceKey(item) === referenceKey);
    let result: SavedPlace | undefined;
    if (saved) result = await api.savePlace({ provider: reference.provider, kind: reference.kind, externalId: reference.externalId });
    else if (existing) {
      try { await api.removeSavedPlace(existing.id); }
      catch (error) { if (!(error instanceof ApiError && error.status === 404)) throw error; }
    }
    await client.cancelQueries({ queryKey: savedPlacesQueryKey(scope), exact: true });
    client.setQueryData<SavedPlace[]>(savedPlacesQueryKey(scope), (current) => {
      // A cleared identity cache must stay absent when an old write finishes.
      if (!current) return current;
      const rest = current.filter((item) => savedPlaceKey(item) !== referenceKey);
      return (result ? [result, ...rest] : rest).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    });
    if (!saved && existing) client.removeQueries({ queryKey: detailsKey(scope, existing.id), exact: true });
  })().finally(() => pending.delete(key));
  pending.set(key, { saved, promise });
  return promise;
}

export function usePlaceSave(reference: SavedPlaceReference) {
  const api = useApi();
  const scope = useCollectionScope();
  const client = useQueryClient();
  const collection = useSavedPlaces();
  const key = savedPlaceKey(reference);
  const entry = collection.data?.find((item) => savedPlaceKey(item) === key);
  const pending = useMutationState({ filters: { mutationKey: writeKey(scope, reference), exact: true, status: "pending" }, select: () => true }).length > 0;
  const mutation = useMutation({ mutationKey: writeKey(scope, reference), mutationFn: (saved: boolean) => setPlaceSaved(client, api, scope, reference, saved), retry: false });
  return { collection, entry, pending, setSaved: mutation.mutateAsync };
}

function detailOptions(api: Api, scope: string, saved: SavedPlace | undefined) {
  const reference = saved ? { provider: saved.provider, kind: saved.kind, externalId: saved.externalId } : undefined;
  return {
    queryKey: detailsKey(scope, saved?.id ?? ""),
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

export function useSavedPlaceDetails(saved: SavedPlace | undefined) {
  return useQuery(detailOptions(useApi(), useCollectionScope(), saved));
}
export function useSavedPlaceDetailList(items: SavedPlace[]) {
  const api = useApi();
  const scope = useCollectionScope();
  return useQueries({ queries: items.map((saved) => detailOptions(api, scope, saved)) });
}
