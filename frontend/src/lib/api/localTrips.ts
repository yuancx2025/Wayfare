import { tripSchema } from "@/domain/schemas";
import type { Trip } from "@/domain/types";
import { loadJSONStrict, saveJSONStrict } from "@/lib/storage";

// Adapters sharing a storage key must also share a read/modify/write queue.
// A future account namespace can use a different key without sharing its queue.
const queues = new Map<string, Promise<void>>();

function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).then(operation);
  const settled = next.then(() => undefined, () => undefined);
  queues.set(key, settled);
  void settled.then(() => { if (queues.get(key) === settled) queues.delete(key); });
  return next;
}

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
    list: () => serialize(key, async () => (await read()).trips),
    mutate: <T>(update: (trips: Trip[]) => { trips: Trip[]; result: T }): Promise<T> => serialize(key, async () => {
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
