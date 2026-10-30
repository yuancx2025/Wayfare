import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";

export type IconName =
  | "arrow" | "back" | "calendar" | "car" | "check" | "chevron" | "clock" | "compass" | "edit" | "heart" | "home"
  | "map" | "minus" | "more" | "pin" | "plane" | "plus" | "search" | "spark" | "star" | "user" | "users" | "wallet"
  | "x" | "walk" | "train" | "sliders" | "trash" | "utensils" | "refresh" | "leaf" | "swap" | "alert" | "eye" | "eyeOff"
  | "mail" | "logout" | "google";

type IonName = ComponentProps<typeof Ionicons>["name"];

const MAP: Record<IconName, IonName> = {
  arrow: "arrow-forward",
  back: "chevron-back",
  calendar: "calendar-outline",
  car: "car-outline",
  check: "checkmark",
  chevron: "chevron-forward",
  clock: "time-outline",
  compass: "compass-outline",
  edit: "create-outline",
  heart: "heart",
  home: "home-outline",
  map: "map-outline",
  minus: "remove",
  more: "ellipsis-horizontal",
  pin: "location-outline",
  plane: "airplane-outline",
  plus: "add",
  search: "search",
  spark: "sparkles-outline",
  star: "star",
  user: "person-outline",
  users: "people-outline",
  wallet: "wallet-outline",
  x: "close",
  walk: "walk-outline",
  train: "train-outline",
  sliders: "options-outline",
  trash: "trash-outline",
  utensils: "restaurant-outline",
  refresh: "refresh",
  leaf: "leaf-outline",
  swap: "swap-horizontal",
  alert: "alert-circle-outline",
  eye: "eye-outline",
  eyeOff: "eye-off-outline",
  mail: "mail-outline",
  logout: "log-out-outline",
  google: "logo-google",
};

export function Icon({ name, size = 20, color = "#15221e" }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={MAP[name]} size={size} color={color} />;
}
