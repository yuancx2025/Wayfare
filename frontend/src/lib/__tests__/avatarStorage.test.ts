import { beforeEach, expect, jest, test } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { loadAvatar, persistAvatar, pickAvatarPhoto } from "@/lib/avatarStorage";
import { INITIALS_AVATAR, type AvatarView } from "@/domain/avatar";

// In-memory stand-in for expo-file-system's File/Directory classes.
const mockDisk = new Set<string>();
const mockFs = { failCopy: false };
let mockUuid = 0;

type MockPart = string | { uri: string };

jest.mock("expo-file-system", () => {
  const join = (parts: MockPart[]) => parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
  class File {
    uri: string;
    constructor(...parts: MockPart[]) { this.uri = join(parts); }
    get name() { return this.uri.split("/").pop()!; }
    get exists() { return mockDisk.has(this.uri); }
    delete() {
      if (!mockDisk.delete(this.uri)) throw new Error("missing");
    }
    async copy(dest: File) {
      if (mockFs.failCopy) throw new Error("No space left on device");
      if (!mockDisk.has(this.uri)) throw new Error("missing source");
      mockDisk.add(dest.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: MockPart[]) { this.uri = join(parts); }
    get exists() { return [...mockDisk].some((f) => f.startsWith(`${this.uri}/`)); }
    create() { /* directories are implicit */ }
    list() {
      return [...mockDisk].filter((f) => f.slice(0, f.lastIndexOf("/")) === this.uri).map((f) => new File(f));
    }
  }
  return { File, Directory, Paths: { document: new Directory("doc") } };
});
jest.mock("expo-crypto", () => ({ randomUUID: () => `uuid-${++mockUuid}` }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn() }));
const mockResize = jest.fn();
jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({
      resize: mockResize,
      renderAsync: async () => ({ saveAsync: async () => ({ uri: "cache/prepared.jpg", width: 512, height: 512 }) }),
    }),
  },
}));

const scope = "account:user_123" as const;
const dir = "doc/avatars/account_user_123";
const metaKey = `wayfare.avatar.v1:${scope}`;
const picked = (uri = "cache/picked.jpg"): AvatarView => {
  mockDisk.add(uri);
  return { kind: "photo", uri };
};

beforeEach(async () => {
  mockDisk.clear();
  mockFs.failCopy = false;
  mockUuid = 0;
  mockResize.mockClear();
  jest.restoreAllMocks();
  await AsyncStorage.clear();
});

test("nothing saved loads initials", async () => {
  await expect(loadAvatar(scope)).resolves.toEqual(INITIALS_AVATAR);
});

test("a saved photo survives a reload and resolves to its document path", async () => {
  const saved = await persistAvatar(scope, picked(), INITIALS_AVATAR);
  expect(saved).toEqual({ kind: "photo", fileName: "uuid-1.jpg", uri: `${dir}/uuid-1.jpg` });
  expect(JSON.parse((await AsyncStorage.getItem(metaKey))!)).toEqual({ kind: "photo", fileName: "uuid-1.jpg" });
  await expect(loadAvatar(scope)).resolves.toEqual(saved);
});

test("scopes are kept apart", async () => {
  await persistAvatar(scope, { kind: "preset", presetId: "leaf" }, INITIALS_AVATAR);
  await expect(loadAvatar("guest")).resolves.toEqual(INITIALS_AVATAR);
  await expect(loadAvatar(scope)).resolves.toEqual({ kind: "preset", presetId: "leaf" });
});

test("replacing a photo with a preset deletes the old file only after metadata saves", async () => {
  const photo = await persistAvatar(scope, picked(), INITIALS_AVATAR);
  const setItem = jest.spyOn(AsyncStorage, "setItem");
  setItem.mockClear();
  setItem.mockImplementationOnce(async () => {
    expect(mockDisk.has(`${dir}/uuid-1.jpg`)).toBe(true);
  });
  await persistAvatar(scope, { kind: "preset", presetId: "plane" }, photo);
  expect(setItem).toHaveBeenCalledTimes(1);
  expect(mockDisk.has(`${dir}/uuid-1.jpg`)).toBe(false);
});

test("a failed metadata write keeps the previous photo and removes the new copy", async () => {
  const photo = await persistAvatar(scope, picked(), INITIALS_AVATAR);
  jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("Storage is full"));
  await expect(persistAvatar(scope, picked("cache/second.jpg"), photo)).rejects.toThrow("Storage is full");
  expect(mockDisk.has(`${dir}/uuid-1.jpg`)).toBe(true);
  expect(mockDisk.has(`${dir}/uuid-2.jpg`)).toBe(false);
  await expect(loadAvatar(scope)).resolves.toEqual(photo);
});

test("a failed copy writes no metadata", async () => {
  const photo = await persistAvatar(scope, picked(), INITIALS_AVATAR);
  mockFs.failCopy = true;
  await expect(persistAvatar(scope, picked("cache/second.jpg"), photo)).rejects.toThrow("No space");
  await expect(loadAvatar(scope)).resolves.toEqual(photo);
});

test("saving the unchanged photo keeps its file", async () => {
  const photo = await persistAvatar(scope, picked(), INITIALS_AVATAR);
  await expect(persistAvatar(scope, photo, photo)).resolves.toEqual(photo);
  expect(mockDisk.has(`${dir}/uuid-1.jpg`)).toBe(true);
});

test("a missing photo file falls back to initials", async () => {
  await persistAvatar(scope, picked(), INITIALS_AVATAR);
  mockDisk.delete(`${dir}/uuid-1.jpg`);
  await expect(loadAvatar(scope)).resolves.toEqual(INITIALS_AVATAR);
});

test("loading removes files that metadata does not reference", async () => {
  await persistAvatar(scope, picked(), INITIALS_AVATAR);
  mockDisk.add(`${dir}/orphan.jpg`);
  await loadAvatar(scope);
  expect([...mockDisk].filter((f) => f.startsWith(dir))).toEqual([`${dir}/uuid-1.jpg`]);
});

test("corrupt metadata loads initials", async () => {
  await AsyncStorage.setItem(metaKey, JSON.stringify({ kind: "photo", fileName: "../../etc/passwd" }));
  await expect(loadAvatar(scope)).resolves.toEqual(INITIALS_AVATAR);
});

test("picker cancellation resolves to null", async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: true, assets: null });
  await expect(pickAvatarPhoto()).resolves.toBeNull();
});

test("a large pick is shrunk to 512px on its long side", async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
    canceled: false, assets: [{ uri: "cache/raw.jpg", width: 3000, height: 3000 } as ImagePicker.ImagePickerAsset],
  });
  await expect(pickAvatarPhoto()).resolves.toBe("cache/prepared.jpg");
  expect(mockResize).toHaveBeenCalledWith({ width: 512, height: null });
});
