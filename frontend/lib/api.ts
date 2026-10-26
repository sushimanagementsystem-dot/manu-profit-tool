const BASE_URL =
  typeof window === "undefined"
    ? process.env.API_BASE_URL
    : process.env.NEXT_PUBLIC_API_URL;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL ?? ""}${path}`, init);

  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}
