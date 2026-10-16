import { useMutation, useQuery, useQueryClient, UseQueryOptions } from "@tanstack/react-query";

const BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j?.error?.message || j?.detail || msg;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json();
}

export const post = <T = any>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });

export function qs(params: Record<string, string | number | undefined | null | boolean>) {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return p.length ? "?" + p.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&") : "";
}

export function useApi<T = any>(path: string | null, opts?: Partial<UseQueryOptions<T>>) {
  return useQuery<T>({
    queryKey: [path],
    queryFn: () => api<T>(path as string),
    enabled: !!path,
    staleTime: 30_000,
    ...(opts as any),
  });
}

/** Mutation that refreshes everything afterwards (the demo state is small). */
export function useAction<V = any, R = any>(fn: (v: V) => Promise<R>, onDone?: (r: R) => void) {
  const qc = useQueryClient();
  return useMutation<R, ApiError, V>({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.invalidateQueries();
      onDone?.(r);
    },
  });
}
