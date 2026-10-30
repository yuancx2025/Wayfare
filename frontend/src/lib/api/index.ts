import { API_URL } from "@/config";
import { createLocalApi } from "./local";
import { createRemoteApi } from "./remote";

export type { Api, GenerateOptions } from "./types";
export { ApiError } from "./types";

/** FastAPI backend when EXPO_PUBLIC_API_URL is set; otherwise the offline planner so the app works standalone. */
export const api = API_URL ? createRemoteApi(API_URL) : createLocalApi();
