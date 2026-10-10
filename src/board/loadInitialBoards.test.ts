import { describe, expect, it, vi } from "vitest";
import type { Board } from "../types";
import { EMPTY_SNAPSHOT, flattenBoards } from "./boardRows";
import { loadInitialBoards } from "./loadInitialBoards";

const b = (id: string): Board => ({ id, title: id, columns: [] });
const emptyRows = { boards: [], columns: [], tasks: [] };

function deps(over: Partial<Parameters<typeof loadInitialBoards>[0]> = {}) {
  return {
    loadD1: vi.fn().mockResolvedValue(emptyRows),
    loadSupabase: vi.fn().mockResolvedValue(null),
    loadLocal: vi.fn().mockReturnValue(null),
    makeDefault: vi.fn().mockReturnValue(b("default")),
    ...over,
  };
}

describe("loadInitialBoards", () => {
  it("D1 có dữ liệu ⇒ dùng D1, không đụng tới Supabase, snapshot = dữ liệu đó", async () => {
    const d = deps({ loadD1: vi.fn().mockResolvedValue(flattenBoards([b("d1")])) });
    const r = await loadInitialBoards(d);
    expect(r.boards.map((x) => x.id)).toEqual(["d1"]);
    expect(r.snapshot.boards.has("d1")).toBe(true);
    expect(d.loadSupabase).not.toHaveBeenCalled();
  });

  it("D1 trống, Supabase có ⇒ dùng Supabase, snapshot rỗng để lần sync đầu đẩy hết lên D1", async () => {
    const r = await loadInitialBoards(deps({ loadSupabase: vi.fn().mockResolvedValue([b("old")]) }));
    expect(r.boards.map((x) => x.id)).toEqual(["old"]);
    expect(r.snapshot).toBe(EMPTY_SNAPSHOT);
  });

  it("cả hai trống ⇒ localStorage cũ, rồi mới tới board mặc định", async () => {
    expect((await loadInitialBoards(deps({ loadLocal: vi.fn().mockReturnValue([b("ls")]) }))).boards[0].id).toBe("ls");
    expect((await loadInitialBoards(deps())).boards[0].id).toBe("default");
  });

  it("Supabase LỖI ⇒ ném lỗi, KHÔNG tạo board mặc định (nếu không sẽ chặn luôn lần chuyển dữ liệu sau)", async () => {
    const d = deps({ loadSupabase: vi.fn().mockRejectedValue(new Error("supabase down")) });
    await expect(loadInitialBoards(d)).rejects.toThrow("supabase down");
    expect(d.makeDefault).not.toHaveBeenCalled();
  });

  it("D1 LỖI ⇒ ném lỗi, không đọc Supabase", async () => {
    const d = deps({ loadD1: vi.fn().mockRejectedValue(new Error("500")) });
    await expect(loadInitialBoards(d)).rejects.toThrow("500");
    expect(d.loadSupabase).not.toHaveBeenCalled();
  });
});
