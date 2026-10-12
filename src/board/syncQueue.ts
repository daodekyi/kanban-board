import {
  chunkPayload,
  diffRows,
  EMPTY_SNAPSHOT,
  isEmptyPayload,
  snapshotRows,
  type RowSnapshot,
  type Rows,
  type SyncPayload,
} from "./boardRows";

export interface SyncQueue {
  /** Đặt mốc "server đang có gì" (sau khi tải xong, hoặc EMPTY_SNAPSHOT khi cần đẩy toàn bộ). */
  reset(snapshot: RowSnapshot): void;
  /** Ghi nhận state mới nhất và sync phần chênh. Promise xong khi hết việc. */
  update(rows: Rows): Promise<void>;
  /** Thử gửi lại sau khi lỗi (nút "Thử lại"). */
  retry(): Promise<void>;
  /** Còn thay đổi mà server chưa có (đang gửi dở hoặc gửi lỗi)? Dùng để cảnh báo khi đóng tab. */
  hasPendingChanges(): boolean;
}

/**
 * Mỗi lúc chỉ một lượt gửi. Thay đổi đến trong lúc đang gửi được gộp lại và
 * gửi sau, luôn là bản mới nhất. Lỗi thì snapshot giữ nguyên ⇒ lần sau gửi lại
 * đủ phần chênh (upsert/xóa lặp lại là vô hại), và báo ra ngoài để UI hiện
 * "Chưa lưu được" — không im lặng như sync Supabase trước đây.
 */
export function createSyncQueue(
  push: (p: SyncPayload) => Promise<void>,
  onFailedChange: (error: string | null) => void
): SyncQueue {
  let snapshot: RowSnapshot = EMPTY_SNAPSHOT;
  let latest: Rows | null = null;
  let dirty = false;
  let running: Promise<void> | null = null;
  // Tăng mỗi lần reset (đổi tài khoản / tải lại). Lượt gửi nào thấy số này đã đổi
  // là việc của "phiên cũ": dừng gửi, không đụng snapshot, không báo lỗi.
  let generation = 0;

  async function pushOnce(): Promise<"ok" | "failed" | "stale"> {
    const next = latest;
    if (!next) return "ok";
    const gen = generation;
    const payload = diffRows(snapshot, next);
    if (isEmptyPayload(payload)) {
      onFailedChange(null);
      return "ok";
    }
    try {
      for (const chunk of chunkPayload(payload)) {
        await push(chunk);
        if (gen !== generation) return "stale";
      }
      snapshot = snapshotRows(next);
      onFailedChange(null);
      return "ok";
    } catch (err) {
      if (gen !== generation) return "stale";
      console.error("Failed to sync boards to Cloudflare D1", err);
      onFailedChange(err instanceof Error ? err.message : String(err));
      return "failed";
    }
  }

  function flush(): Promise<void> {
    dirty = true;
    if (running) return running;
    running = (async () => {
      try {
        // Kiểm `dirty` và thoát vòng lặp không có await xen giữa, nên không có
        // khe hở để một update bị bỏ sót.
        while (dirty) {
          dirty = false;
          // Chỉ dừng khi lỗi thật; "stale" thì xem tiếp có update mới sau reset không.
          if ((await pushOnce()) === "failed") break;
        }
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    reset(s) {
      generation++;
      snapshot = s;
      latest = null;
      dirty = false;
    },
    update(rows) {
      latest = rows;
      return flush();
    },
    retry() {
      return flush();
    },
    hasPendingChanges() {
      return latest !== null && !isEmptyPayload(diffRows(snapshot, latest));
    },
  };
}
