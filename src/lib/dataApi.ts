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
const UNEXPECTED =
  "Phản hồi không đúng định dạng của Worker — kiểm tra VITE_AGENT_WORKER_URL có đang trỏ đúng Worker không.";

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
      const body = (await call("/data")) as Partial<Rows>;
      if (!Array.isArray(body.boards) || !Array.isArray(body.columns) || !Array.isArray(body.tasks)) {
        throw new Error(UNEXPECTED);
      }
      return body as Rows;
    },
    async sync(payload) {
      const body = (await call("/data/sync", { method: "POST", body: JSON.stringify(payload) })) as { ok?: boolean };
      if (body.ok !== true) throw new Error(UNEXPECTED);
    },
  };
}
