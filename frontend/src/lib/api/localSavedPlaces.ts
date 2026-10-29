import { randomUUID } from "expo-crypto";
import type { SavedPlace, SavedPlaceReference } from "@/domain/types";
import { savedPlaceReferenceSchema, savedPlaceSchema } from "@/domain/schemas";
import { savedPlaceKey } from "@/domain/logic/savedPlaces";
import { loadJSONStrict, saveJSONStrict } from "@/lib/storage";
import { ApiError } from "./types";
import { withStorageLock } from "./storageQueue";

/** References only. Saving, listing and removing never depend on provider availability. */
export function createLocalSavedPlaceRepository(key: string) {
  async function read() {
    const stored = await loadJSONStrict<unknown>(key);
    if (stored !== undefined && !Array.isArray(stored)) throw new Error("Saved places could not be read.");
    const items: SavedPlace[] = [];
    const unreadable: unknown[] = [];
    for (const record of stored ?? []) {
      const parsed = savedPlaceSchema.safeParse(record);
      if (parsed.success) items.push(parsed.data);
      else unreadable.push(record);
    }
    if (unreadable.length > 0 && items.length === 0) throw new Error("Saved places could not be read.");
    return { items, unreadable };
  }

  return {
    list: () => withStorageLock(key, async () => (await read()).items.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))),
    save: async (input: SavedPlaceReference): Promise<SavedPlace> => {
      const reference = savedPlaceReferenceSchema.parse(input);
      return withStorageLock(key, async () => {
        const { items, unreadable } = await read();
        const existing = items.find((item) => savedPlaceKey(item) === savedPlaceKey(reference));
        if (existing) return existing;
        const item: SavedPlace = { ...reference, id: `saved-${randomUUID()}`, createdAt: Date.now() };
        await saveJSONStrict(key, [item, ...items, ...unreadable]);
        return item;
      });
    },
    remove: (id: string): Promise<void> => withStorageLock(key, async () => {
      const { items, unreadable } = await read();
      if (!items.some((item) => item.id === id)) throw new ApiError(404, "Saved place not found");
      await saveJSONStrict(key, [...items.filter((item) => item.id !== id), ...unreadable]);
    }),
  };
}
