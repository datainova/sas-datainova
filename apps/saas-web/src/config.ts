const rawApiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export const config = {
  apiBaseUrl: `${rawApiUrl.replace(/\/$/, "")}/v1`
} as const;
