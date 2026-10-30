import Constants from "expo-constants";
import { Platform } from "react-native";

const LOCAL = /^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/;

/** The dev machine's address as the device sees it, taken from the Metro bundler URL ("192.168.1.5:8081"). */
function devHost(): string | undefined {
  return Constants.expoConfig?.hostUri?.split(":")[0];
}

/**
 * `localhost` on a phone or emulator is the device itself, so an API URL pointing at the dev machine is rewritten
 * to the host Metro is served from (or the Android emulator's alias for it).
 */
export function resolveApiUrl(raw: string | undefined, platform: string = Platform.OS, host: string | undefined = devHost()) {
  const url = raw?.trim().replace(/\/$/, "");
  if (!url) return undefined;
  if (platform === "web" || !LOCAL.test(url)) return url;
  const target = host && !LOCAL.test(`http://${host}`) ? host : platform === "android" ? "10.0.2.2" : undefined;
  return target ? url.replace(LOCAL, `$1${target}`) : url;
}

export const API_URL = resolveApiUrl(process.env.EXPO_PUBLIC_API_URL);
