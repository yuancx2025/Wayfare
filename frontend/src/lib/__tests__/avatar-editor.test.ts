import React, { act } from "react";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { AvatarEditor } from "@/components/profile/AvatarEditor";
import { cameraAccess, pickAvatarPhoto } from "@/lib/avatarStorage";
import type { AvatarView } from "@/domain/avatar";

jest.mock("@/state/store", () => ({ useStore: () => mockStore }));
jest.mock("@/lib/avatarStorage", () => ({ pickAvatarPhoto: jest.fn(), cameraAccess: jest.fn() }));
jest.mock("@/components/profile/Avatar", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    Avatar: (props: object) => React.createElement("Avatar", props),
    AVATAR_PRESETS: Object.fromEntries(
      ["plane", "compass", "map", "leaf", "train", "food"].map((id) => [id, { label: id[0].toUpperCase() + id.slice(1) }]),
    ),
  };
});
jest.mock("@/components/ui", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    BottomSheet: ({ open, onClose, children, footer }: { open: boolean; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) =>
      React.createElement("BottomSheet", { open, onClose }, children, footer),
    Button: (props: object) => React.createElement("Button", props),
    ErrorLine: (props: object) => React.createElement("ErrorLine", props),
  };
});

const saveAvatar = jest.fn<(draft: AvatarView) => Promise<void>>();
let mockStore: { avatar: AvatarView | null; saveAvatar: typeof saveAvatar };
let screen: ReactTestRenderer;
const onClose = jest.fn();

const hosts = (name: string) => screen.root.findAll((node) => node.type === name);
const button = (label: string) => hosts("Button").find((node) => node.props.children === label)!;
const preview = () => hosts("Avatar").find((node) => node.props.size === 104)!.props.avatar;
const option = (label: string) => screen.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === "function");
const render = (open: boolean) => React.createElement(AvatarEditor, { open, onClose, initials: "AR" });
const mount = async (open = true) => { await act(async () => { screen = create(render(open)); }); };

beforeEach(() => {
  jest.clearAllMocks();
  saveAvatar.mockReset().mockResolvedValue(undefined);
  mockStore = { avatar: { kind: "initials" }, saveAvatar };
});

afterEach(async () => {
  if (screen) await act(async () => { screen.unmount(); });
});

test("save is disabled until the draft differs from the saved avatar", async () => {
  await mount();
  expect(button("Save avatar").props.disabled).toBe(true);
  await act(async () => { option("Leaf").props.onPress(); });
  expect(preview()).toEqual({ kind: "preset", presetId: "leaf" });
  expect(button("Save avatar").props.disabled).toBe(false);
});

test("cancelling the photo picker keeps the current draft", async () => {
  jest.mocked(pickAvatarPhoto).mockResolvedValueOnce(null);
  await mount();
  await act(async () => { option("Leaf").props.onPress(); });
  await act(async () => { button("Choose photo").props.onPress(); });
  expect(preview()).toEqual({ kind: "preset", presetId: "leaf" });
});

test("a picked photo is previewed and saved, then the sheet closes", async () => {
  jest.mocked(pickAvatarPhoto).mockResolvedValueOnce("cache/prepared.jpg");
  await mount();
  await act(async () => { button("Choose photo").props.onPress(); });
  expect(preview()).toEqual({ kind: "photo", uri: "cache/prepared.jpg" });
  await act(async () => { button("Save avatar").props.onPress(); });
  expect(saveAvatar).toHaveBeenCalledWith({ kind: "photo", uri: "cache/prepared.jpg" });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("a photo from the camera is previewed like a picked one", async () => {
  jest.mocked(cameraAccess).mockResolvedValueOnce("granted");
  jest.mocked(pickAvatarPhoto).mockResolvedValueOnce("cache/selfie.jpg");
  await mount();
  await act(async () => { button("Take photo").props.onPress(); });
  expect(pickAvatarPhoto).toHaveBeenCalledWith("camera");
  expect(preview()).toEqual({ kind: "photo", uri: "cache/selfie.jpg" });
  expect(button("Save avatar").props.disabled).toBe(false);
});

test("refused camera access opens nothing and offers Settings only when it is blocked", async () => {
  await mount();
  jest.mocked(cameraAccess).mockResolvedValueOnce("denied");
  await act(async () => { button("Take photo").props.onPress(); });
  expect(hosts("ErrorLine")[0].props.message).toMatch(/wasn't allowed/);
  expect(button("Open Settings")).toBeUndefined();
  jest.mocked(cameraAccess).mockResolvedValueOnce("blocked");
  await act(async () => { button("Take photo").props.onPress(); });
  expect(hosts("ErrorLine")[0].props.message).toMatch(/Turn it on in Settings/);
  expect(button("Open Settings")).toBeDefined();
  expect(pickAvatarPhoto).not.toHaveBeenCalled();
  expect(preview()).toEqual({ kind: "initials" });
});

test("a device without a camera gets a message instead of a crash", async () => {
  jest.mocked(cameraAccess).mockResolvedValueOnce("granted");
  jest.mocked(pickAvatarPhoto).mockRejectedValueOnce(new Error("Camera not available on simulator"));
  await mount();
  await act(async () => { button("Take photo").props.onPress(); });
  expect(hosts("ErrorLine")[0].props.message).toMatch(/Couldn't open the camera/);
});

test("closing discards the draft, and reopening starts from the saved avatar", async () => {
  await mount();
  await act(async () => { option("Leaf").props.onPress(); });
  await act(async () => { hosts("BottomSheet")[0].props.onClose(); });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(saveAvatar).not.toHaveBeenCalled();
  await act(async () => { screen.update(render(false)); });
  await act(async () => { screen.update(render(true)); });
  expect(preview()).toEqual({ kind: "initials" });
});

test("a failed save keeps the sheet open with the draft for a retry", async () => {
  saveAvatar.mockRejectedValueOnce(new Error("Storage is full"));
  await mount();
  await act(async () => { option("Leaf").props.onPress(); });
  await act(async () => { button("Save avatar").props.onPress(); });
  expect(onClose).not.toHaveBeenCalled();
  expect(hosts("ErrorLine")[0].props.message).toMatch(/Couldn't save your avatar/);
  expect(preview()).toEqual({ kind: "preset", presetId: "leaf" });
  await act(async () => { button("Save avatar").props.onPress(); });
  expect(saveAvatar).toHaveBeenCalledTimes(2);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("repeated taps share one save and lock the sheet until it finishes", async () => {
  let finish!: () => void;
  saveAvatar.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  await mount();
  await act(async () => { option("Leaf").props.onPress(); });
  const press = button("Save avatar").props.onPress;
  await act(async () => { press(); press(); });
  expect(saveAvatar).toHaveBeenCalledTimes(1);
  expect(button("Saving…").props.disabled).toBe(true);
  expect(button("Choose photo").props.disabled).toBe(true);
  await act(async () => { hosts("BottomSheet")[0].props.onClose(); });
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => { finish(); });
  expect(onClose).toHaveBeenCalledTimes(1);
});
