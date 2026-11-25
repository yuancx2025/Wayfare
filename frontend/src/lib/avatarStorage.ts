import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { randomUUID } from "expo-crypto";
import { avatarSchema, INITIALS_AVATAR, type Avatar, type AvatarView } from "@/domain/avatar";
import { loadJSON, saveJSONStrict } from "@/lib/storage";

/** Matches the identity key in app/_layout.tsx: each account and the guest keep their own avatar on this device. */
export type AvatarScope = "guest" | `account:${string}`;

const MAX_SIDE = 512;
const metadataKey = (scope: AvatarScope) => `wayfare.avatar.v1:${scope}`;
const folder = (scope: AvatarScope) => new Directory(Paths.document, "avatars", scope.replace(/[^A-Za-z0-9_-]/g, "_"));

export type CameraAccess = "granted" | "denied" | "blocked";

/** Asks for the camera only when the user taps Take photo. "blocked" means only Settings can turn it back on. */
export async function cameraAccess(): Promise<CameraAccess> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  return permission.granted ? "granted" : permission.canAskAgain ? "denied" : "blocked";
}

/**
 * Opens the photo library, or the front camera, with a square crop. Resolves to a small JPEG in the cache, or null if
 * the user cancels. Call cameraAccess() before using the camera.
 */
export async function pickAvatarPhoto(source: "library" | "camera" = "library"): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: "images",
    allowsEditing: true,
    aspect: [1, 1], // Android only; iOS always crops to a square.
    quality: 1,
  };
  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front })
    : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_SIDE) {
    context.resize(asset.width >= asset.height ? { width: MAX_SIDE, height: null } : { width: null, height: MAX_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}

function toView(scope: AvatarScope, avatar: Avatar): AvatarView {
  if (avatar.kind !== "photo") return avatar;
  const file = new File(folder(scope), avatar.fileName);
  return file.exists ? { kind: "photo", fileName: avatar.fileName, uri: file.uri } : INITIALS_AVATAR;
}

/** Deletes photos left behind by an interrupted save or a failed cleanup. */
function removeUnreferenced(scope: AvatarScope, keep: string | null) {
  try {
    const dir = folder(scope);
    if (!dir.exists) return;
    for (const entry of dir.list()) {
      if (entry instanceof File && entry.name !== keep) entry.delete();
    }
  } catch {
    /* best effort */
  }
}

/** The saved avatar for this scope. Unreadable metadata or a missing photo falls back to initials. */
export async function loadAvatar(scope: AvatarScope): Promise<AvatarView> {
  const parsed = avatarSchema.safeParse(await loadJSON(metadataKey(scope)));
  const saved: Avatar = parsed.success ? parsed.data : { kind: "initials" };
  removeUnreferenced(scope, saved.kind === "photo" ? saved.fileName : null);
  return toView(scope, saved);
}

/**
 * Saves `draft` in place of `previous`. Order: copy the new photo, write metadata, then delete the replaced photo,
 * so a failure at any step leaves the previous avatar intact. Rejects if the photo or metadata can't be written.
 */
export async function persistAvatar(scope: AvatarScope, draft: AvatarView, previous: AvatarView): Promise<AvatarView> {
  let next: Avatar;
  let created: File | null = null;
  if (draft.kind === "photo" && draft.fileName) {
    next = { kind: "photo", fileName: draft.fileName };
  } else if (draft.kind === "photo") {
    const dir = folder(scope);
    dir.create({ intermediates: true, idempotent: true });
    created = new File(dir, `${randomUUID()}.jpg`);
    next = { kind: "photo", fileName: created.name };
  } else {
    next = draft;
  }

  try {
    // Copy rather than move, so the draft preview still works if the user retries after a failure.
    if (created && draft.kind === "photo") await new File(draft.uri).copy(created);
    await saveJSONStrict(metadataKey(scope), next);
  } catch (e) {
    try {
      if (created?.exists) created.delete();
    } catch {
      /* swept on next load */
    }
    throw e;
  }

  const kept = next.kind === "photo" ? next.fileName : null;
  if (previous.kind === "photo" && previous.fileName && previous.fileName !== kept) {
    try {
      new File(folder(scope), previous.fileName).delete();
    } catch {
      /* swept on next load */
    }
  }
  return created ? { kind: "photo", fileName: created.name, uri: created.uri } : toView(scope, next);
}
