import AsyncStorage from "@react-native-async-storage/async-storage";

// AsyncStorage-shaped wrapper. The Vite preview uses the same method names over localStorage.
export const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      /* quota or private mode */
    }
  },
  async setItemStrict(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export async function loadJSON<T>(key: string): Promise<T | null> {
  const raw = await storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const saveJSON = (key: string, value: unknown) => storage.setItem(key, JSON.stringify(value));

/** Like `saveJSON`, but a failed write rejects instead of being ignored. */
export const saveJSONStrict = (key: string, value: unknown) => storage.setItemStrict(key, JSON.stringify(value));
