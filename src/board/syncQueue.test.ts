import { describe, expect, it, vi } from "vitest";
import type { Rows, SyncPayload } from "./boardRows";
import { snapshotRows } from "./boardRows";
import { createSyncQueue } from "./syncQueue";

function rows(title: string): Rows {
  return { boards: [{ id: "b1", title, board_order: 0 }], columns: [], tasks: [] };
}

describe("createSyncQueue", () => {
  it("lần đầu (snapshot rỗng) đẩy toàn bộ; lần sau không đổi thì không gửi", async () => {
    const push = vi.fn<(p: SyncPayload) => Promise<void>>().mockResolvedValue();
    const q = createSyncQueue(push, () => {});
    await q.update(rows("A"));
    await q.update(rows("A"));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0].upsert.boards[0].title).toBe("A");
  });

  it("reset bằng dữ liệu vừa tải ⇒ không gửi lại thứ đã có trên server", async () => {
    const push = vi.fn<(p: SyncPayload) => Promise<void>>().mockResolvedValue();
    const q = createSyncQueue(push, () => {});
    q.reset(snapshotRows(rows("A")));
    await q.update(rows("A"));
    expect(push).not.toHaveBeenCalled();
  });

  it("lỗi thì giữ snapshot cũ, báo failed; lần sau gửi lại rồi báo hết lỗi", async () => {
    const push = vi.fn<(p: SyncPayload) => Promise<void>>().mockRejectedValueOnce(new Error("500")).mockResolvedValue();
    const failed: boolean[] = [];
    const q = createSyncQueue(push, (f) => failed.push(f));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await q.update(rows("A"));
    await q.retry();
    expect(push).toHaveBeenCalledTimes(2);
    expect(push.mock.calls[1][0].upsert.boards[0].title).toBe("A");
    expect(failed).toEqual([true, false]);
    expect(spy).toHaveBeenCalledWith("Failed to sync boards to Cloudflare D1", expect.any(Error));
    spy.mockRestore();
  });

  it("thay đổi dồn dập trong lúc đang gửi ⇒ gộp thành đúng 1 lần gửi tiếp, mang bản mới nhất", async () => {
    let release!: () => void;
    const push = vi
      .fn<(p: SyncPayload) => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      .mockResolvedValue();
    const q = createSyncQueue(push, () => {});
    const first = q.update(rows("A"));
    void q.update(rows("B"));
    void q.update(rows("C"));
    release();
    await first;
    expect(push).toHaveBeenCalledTimes(2);
    expect(push.mock.calls[1][0].upsert.boards[0].title).toBe("C");
  });
});
