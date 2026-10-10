import { describe, expect, it } from "vitest";
import type { Board } from "../types";
import {
  assembleBoards,
  chunkPayload,
  diffRows,
  EMPTY_SNAPSHOT,
  flattenBoards,
  isEmptyPayload,
  payloadSize,
  snapshotRows,
} from "./boardRows";

const boards: Board[] = [
  {
    id: "b1",
    title: "Học AI",
    columns: [
      {
        id: "c1",
        title: "1. To Do",
        order: 0,
        isDone: false,
        wipLimit: 3,
        cards: [
          { id: "t1", title: "Đọc docs", labels: ["ui"], priority: "high", order: 0, dueDate: "2026-10-20", subtasks: [], assignee: "Dekyi" },
          { id: "t2", title: "Viết test", labels: [], priority: "low", order: 1, subtasks: [{ id: "s1", title: "x", isDone: true }] },
        ],
      },
      { id: "c2", title: "Done", order: 1, isDone: true, cards: [] },
    ],
  },
];

describe("assembleBoards / flattenBoards", () => {
  it("flatten rồi assemble ra lại đúng board ban đầu", () => {
    const back = assembleBoards(flattenBoards(boards));
    expect(back[0].columns[0].cards.map((c) => c.id)).toEqual(["t1", "t2"]);
    expect(back[0].columns[0].cards[0]).toMatchObject({ dueDate: "2026-10-20", assignee: "Dekyi", priority: "high" });
    expect(back[0].columns[0].cards[1].dueDate).toBeUndefined();
    expect(back[0].columns[1]).toMatchObject({ isDone: true, wipLimit: undefined });
  });

  it("flatten không gửi owner_id — Worker tự gán từ token", () => {
    expect(flattenBoards(boards).boards[0]).toEqual({ id: "b1", title: "Học AI", board_order: 0 });
  });
});

describe("diffRows", () => {
  it("từ snapshot rỗng ⇒ đẩy toàn bộ, không xóa gì", () => {
    const p = diffRows(EMPTY_SNAPSHOT, flattenBoards(boards));
    expect([p.upsert.boards.length, p.upsert.columns.length, p.upsert.tasks.length]).toEqual([1, 2, 2]);
    expect(p.remove).toEqual({ boardIds: [], columnIds: [], taskIds: [] });
  });

  it("không đổi gì ⇒ payload rỗng", () => {
    const rows = flattenBoards(boards);
    expect(isEmptyPayload(diffRows(snapshotRows(rows), rows))).toBe(true);
  });

  it("đổi tiêu đề 1 thẻ ⇒ chỉ gửi đúng thẻ đó", () => {
    const snap = snapshotRows(flattenBoards(boards));
    const changed = structuredClone(boards);
    changed[0].columns[0].cards[1].title = "Viết test kỹ";
    const p = diffRows(snap, flattenBoards(changed));
    expect(p.upsert.tasks.map((t) => t.id)).toEqual(["t2"]);
    expect(payloadSize(p)).toBe(1);
  });

  it("xóa thẻ ⇒ id nằm trong remove.taskIds", () => {
    const snap = snapshotRows(flattenBoards(boards));
    const changed = structuredClone(boards);
    changed[0].columns[0].cards.splice(0, 1);
    const p = diffRows(snap, flattenBoards(changed));
    expect(p.remove.taskIds).toEqual(["t1"]);
  });
});

describe("chunkPayload", () => {
  const tasks = Array.from({ length: 450 }, (_, i) => ({
    id: `t${i}`, column_id: "c1", board_id: "b1", title: "x", description: null, labels: [], priority: "low",
    due_date: null, task_order: i, entered_column_at: null, subtasks: [], assignee: null,
  }));
  const big = {
    upsert: { boards: [{ id: "b1", title: "B", board_order: 0 }], columns: [{ id: "c1", board_id: "b1", title: "C", col_order: 0, is_done: false, wip_limit: null }], tasks },
    remove: { boardIds: [], columnIds: [], taskIds: ["old1", "old2"] },
  };

  it("mỗi chunk tối đa 200 dòng và không mất dòng nào", () => {
    const chunks = chunkPayload(big);
    for (const c of chunks) expect(payloadSize(c)).toBeLessThanOrEqual(200);
    expect(chunks.reduce((n, c) => n + payloadSize(c), 0)).toBe(payloadSize(big));
  });

  it("xóa đi trước, board ghi SAU CÙNG (đứt giữa chừng thì lần tải sau vẫn chuyển lại)", () => {
    const chunks = chunkPayload(big);
    expect(chunks[0].remove.taskIds).toEqual(["old1", "old2"]);
    expect(chunks.slice(0, -1).every((c) => c.upsert.boards.length === 0)).toBe(true);
    expect(chunks.at(-1)!.upsert.boards.map((b) => b.id)).toEqual(["b1"]);
  });

  it("payload rỗng ⇒ không có chunk", () => {
    expect(chunkPayload(diffRows(EMPTY_SNAPSHOT, { boards: [], columns: [], tasks: [] }))).toEqual([]);
  });
});
