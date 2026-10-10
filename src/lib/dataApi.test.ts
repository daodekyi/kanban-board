import { describe, expect, it, vi } from "vitest";
import { createDataApi } from "./dataApi";

const emptyPayload = {
  upsert: { boards: [], columns: [], tasks: [] },
  remove: { boardIds: [], columnIds: [], taskIds: [] },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("createDataApi", () => {
  it("load: GET /data kèm Bearer token", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ boards: [], columns: [], tasks: [] }));
    const api = createDataApi("https://w.example.dev/", async () => "tok", fetchFn);
    expect(await api.load()).toEqual({ boards: [], columns: [], tasks: [] });
    expect(fetchFn).toHaveBeenCalledWith("https://w.example.dev/data", { headers: { Authorization: "Bearer tok" } });
  });

  it("sync: POST /data/sync với body JSON", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ ok: true }));
    const api = createDataApi("https://w.example.dev", async () => "tok", fetchFn);
    await api.sync(emptyPayload);
    expect(fetchFn).toHaveBeenCalledWith("https://w.example.dev/data/sync", {
      method: "POST",
      headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
      body: JSON.stringify(emptyPayload),
    });
  });

  it("lỗi từ Worker ⇒ reject kèm đúng câu lỗi của Worker", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ error: "upsert.tasks.0.due_date: phải là YYYY-MM-DD" }, 400));
    const api = createDataApi("https://w.example.dev", async () => "tok", fetchFn);
    await expect(api.sync(emptyPayload)).rejects.toThrow("400: upsert.tasks.0.due_date: phải là YYYY-MM-DD");
  });

  it("chưa đăng nhập ⇒ reject, không gọi mạng", async () => {
    const fetchFn = vi.fn();
    const api = createDataApi("https://w.example.dev", async () => null, fetchFn);
    await expect(api.load()).rejects.toThrow("Chưa đăng nhập");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("thiếu VITE_AGENT_WORKER_URL ⇒ reject với hướng dẫn", async () => {
    const api = createDataApi(undefined, async () => "tok", vi.fn());
    await expect(api.load()).rejects.toThrow("VITE_AGENT_WORKER_URL");
  });
});
