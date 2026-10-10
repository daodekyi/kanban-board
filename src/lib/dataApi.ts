import type { Rows, SyncPayload } from "../board/boardRows";

export interface DataApi {
  load(): Promise<Rows>;
  sync(payload: SyncPayload): Promise<void>;
}

/**
 * Gọi lớp dữ liệu trên Worker (cùng Worker với trợ lý AI, cùng biến
 * VITE_AGENT_WORKER_URL). Không import supabase ở đây để test chạy được mà
 * không cần biến môi trường — token được truyền vào qua getToken.
 */
export function createDataApi(
  baseUrl: string | undefined,
  getToken: () => Promise<string | null>,
  fetchFn: typeof fetch = (...args) => fetch(...args)
): DataApi {
  async function call(path: string, init: { method?: string; body?: string } = {}): Promise<unknown> {
    if (!baseUrl) throw new Error("Chưa cấu hình VITE_AGENT_WORKER_URL — không có nơi lưu dữ liệu.");
    const token = await getToken();
    if (!token) throw new Error("Chưa đăng nhập");
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetchFn(new URL(path, baseUrl).toString(), { ...init, headers });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(`${res.status}: ${body.error ?? res.statusText}`);
    return body;
  }

  return {
    async load() {
      return (await call("/data")) as Rows;
    },
    async sync(payload) {
      await call("/data/sync", { method: "POST", body: JSON.stringify(payload) });
    },
  };
}
