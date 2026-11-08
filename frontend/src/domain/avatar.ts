import { z } from "zod";

/** Stable ids: they are saved on the device, so never rename one. */
export const AVATAR_PRESET_IDS = ["plane", "compass", "map", "leaf", "train", "food"] as const;
export type AvatarPresetId = (typeof AVATAR_PRESET_IDS)[number];

/** What is saved. A photo is stored by file name only; its full path changes when the app is updated. */
export type Avatar =
  | { kind: "initials" }
  | { kind: "preset"; presetId: AvatarPresetId }
  | { kind: "photo"; fileName: string };

/**
 * What screens render and the editor drafts. A photo with `fileName` is the saved one; without it, `uri` is a
 * freshly picked image in the cache that has not been saved yet.
 */
export type AvatarView =
  | { kind: "initials" }
  | { kind: "preset"; presetId: AvatarPresetId }
  | { kind: "photo"; uri: string; fileName?: string };

export const INITIALS_AVATAR: AvatarView = { kind: "initials" };

export const avatarSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("initials") }),
  z.object({ kind: z.literal("preset"), presetId: z.enum(AVATAR_PRESET_IDS) }),
  z.object({ kind: z.literal("photo"), fileName: z.string().regex(/^[A-Za-z0-9-]+\.jpg$/) }),
]);

export function sameAvatar(a: AvatarView | null, b: AvatarView | null): boolean {
  if (!a || !b || a.kind !== b.kind) return a === b;
  if (a.kind === "preset" && b.kind === "preset") return a.presetId === b.presetId;
  if (a.kind === "photo" && b.kind === "photo") return a.uri === b.uri;
  return true;
}
