import { tripSchema } from "@/domain/schemas";
import type { Trip } from "@/domain/types";
import { loadJSONStrict, saveJSONStrict } from "@/lib/storage";
import { withStorageLock } from "./storageQueue";

export function createLocalTripRepository(key: string) {
  async function read() {
    const stored = await loadJSONStrict<unknown>(key);
    if (stored !== undefined && !Array.isArray(stored)) throw new Error("Stored trips could not be read.");
    const trips: Trip[] = [];
    const unreadable: unknown[] = [];
    for (const record of stored ?? []) {
      const parsed = tripSchema.safeParse(record);
      if (parsed.success) trips.push(parsed.data as Trip);
      else unreadable.push(record);
    }
    if (unreadable.length > 0 && trips.length === 0) throw new Error("Stored trips could not be read.");
    return { trips, unreadable };
  }

  return {
    // Read fresh committed records instead of keeping competing adapter caches.
    list: () => withStorageLock(key, async () => (await read()).trips),
    mutate: <T>(update: (trips: Trip[]) => { trips: Trip[]; result: T }): Promise<T> => withStorageLock(key, async () => {
      const snapshot = await read();
      const next = update(snapshot.trips);
      if (next.trips !== snapshot.trips) {
        // Retain malformed entries for recovery rather than erasing unrelated data.
        await saveJSONStrict(key, [...next.trips, ...snapshot.unreadable]);
      }
      return next.result;
    }),
  };
}
