import * as Crypto from "expo-crypto";
import { OnlineApiClient, OnlineSession } from "./online-session";

const apiUrl = process.env.EXPO_PUBLIC_API_URL;

export const onlineSession = new OnlineSession(async (signal) => {
  if (!apiUrl) return false;
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/health/ready`, {
    signal,
    cache: "no-store",
    credentials: "omit",
    redirect: "error"
  });
  if (!response.ok) return false;
  const data: unknown = await response.json();
  return typeof data === "object" && data !== null && "status" in data && data.status === "ok"
    && "service" in data && data.service === "bff-app";
});

export const apiClient = apiUrl
  ? new OnlineApiClient(apiUrl, onlineSession, fetch, () => Crypto.randomUUID())
  : undefined;