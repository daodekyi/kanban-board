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
}

/**
 * Mỗi lúc chỉ một lượt gửi. Thay đổi đến trong lúc đang gửi được gộp lại và
 * gửi sau, luôn là bản mới nhất. Lỗi thì snapshot giữ nguyên ⇒ lần sau gửi lại
 * đủ phần chênh (upsert/xóa lặp lại là vô hại), và báo ra ngoài để UI hiện
 * "Chưa lưu được" — không im lặng như sync Supabase trước đây.
 */
export function createSyncQueue(
  push: (p: SyncPayload) => Promise<void>,
  onFailedChange: (failed: boolean) => void
): SyncQueue {
  let snapshot: RowSnapshot = EMPTY_SNAPSHOT;
  let latest: Rows | null = null;
  let dirty = false;
  let running: Promise<void> | null = null;

  async function pushOnce(): Promise<boolean> {
    const next = latest;
    if (!next) return true;
    const payload = diffRows(snapshot, next);
    if (isEmptyPayload(payload)) {
      onFailedChange(false);
      return true;
    }
    try {
      for (const chunk of chunkPayload(payload)) await push(chunk);
      snapshot = snapshotRows(next);
      onFailedChange(false);
      return true;
    } catch (err) {
      console.error("Failed to sync boards to Cloudflare D1", err);
      onFailedChange(true);
      return false;
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
          if (!(await pushOnce())) break;
        }
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    reset(s) {
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
  };
}
