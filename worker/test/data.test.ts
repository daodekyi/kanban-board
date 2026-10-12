// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildSyncStatements, loadRows, MAX_PARAMS, syncRows } from "../src/data";
import { memoryRunner } from "./sqliteRunner";

const A = "user-a";
const B = "user-b";

function task(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    column_id: "col-1",
    board_id: "board-1",
    title: `Thẻ ${id}`,
    description: null,
    labels: ["ui"],
    priority: "medium",
    due_date: "2026-10-20",
    task_order: 0,
    entered_column_at: "2026-10-10T12:00:00.000Z",
    subtasks: [{ id: "s1", title: "Việc con", isDone: false }],
    assignee: "Dekyi",
    ...extra,
  };
}

function payload(over: { boards?: unknown[]; columns?: unknown[]; tasks?: unknown[]; remove?: Partial<Record<"boardIds" | "columnIds" | "taskIds", string[]>> } = {}) {
  return {
    upsert: { boards: over.boards ?? [], columns: over.columns ?? [], tasks: over.tasks ?? [] },
    remove: { boardIds: [], columnIds: [], taskIds: [], ...over.remove },
  };
}

const board1 = { id: "board-1", title: "Học AI", board_order: 0 };
const col1 = { id: "col-1", board_id: "board-1", title: "1. To Do", col_order: 0, is_done: false, wip_limit: 3 };

describe("loadRows / syncRows", () => {
  it("user mới: cả 3 bảng rỗng", async () => {
    const db = memoryRunner();
    expect(await loadRows(db, A)).toEqual({ boards: [], columns: [], tasks: [] });
  });

  it("ghi rồi đọc lại đúng kiểu dữ liệu (boolean, mảng JSON)", async () => {
    const db = memoryRunner();
    const res = await syncRows(db, A, payload({ boards: [board1], columns: [col1], tasks: [task("t1")] }));
    expect(res).toEqual({ ok: true });
    const rows = await loadRows(db, A);
    expect(rows.boards).toEqual([board1]);
    expect(rows.columns).toEqual([col1]);
    expect(rows.tasks).toEqual([task("t1")]);
  });

  it("chủ board sửa được dữ liệu của chính mình", async () => {
    const db = memoryRunner();
    await syncRows(db, A, payload({ boards: [board1] }));
    await syncRows(db, A, payload({ boards: [{ ...board1, title: "Đổi tên" }] }));
    expect((await loadRows(db, A)).boards[0].title).toBe("Đổi tên");
  });

  it("xóa theo id chỉ xóa đúng dòng của chủ", async () => {
    const db = memoryRunner();
    await syncRows(db, A, payload({ tasks: [task("t1"), task("t2")] }));
    await syncRows(db, A, payload({ remove: { taskIds: ["t1"] } }));
    expect((await loadRows(db, A)).tasks.map((t) => t.id)).toEqual(["t2"]);
  });

  it("BẢO MẬT: B gửi id board của A để ghi đè — dữ liệu của A không đổi, B không thấy gì", async () => {
    const db = memoryRunner();
    await syncRows(db, A, payload({ boards: [board1], tasks: [task("t1")] }));
    await syncRows(db, B, payload({ boards: [{ ...board1, title: "Bị chiếm" }], tasks: [task("t1", { title: "Bị chiếm" })] }));
    const a = await loadRows(db, A);
    expect(a.boards[0].title).toBe("Học AI");
    expect(a.tasks[0].title).toBe("Thẻ t1");
    expect(await loadRows(db, B)).toEqual({ boards: [], columns: [], tasks: [] });
  });

  it("BẢO MẬT: B gửi lệnh xóa id của A — không xóa được", async () => {
    const db = memoryRunner();
    await syncRows(db, A, payload({ boards: [board1], columns: [col1], tasks: [task("t1")] }));
    await syncRows(db, B, payload({ remove: { boardIds: ["board-1"], columnIds: ["col-1"], taskIds: ["t1"] } }));
    const a = await loadRows(db, A);
    expect([a.boards.length, a.columns.length, a.tasks.length]).toEqual([1, 1, 1]);
  });

  it("BẢO MẬT: owner_id trong body bị bỏ qua, luôn dùng id từ token", async () => {
    const db = memoryRunner();
    await syncRows(db, B, payload({ boards: [{ ...board1, owner_id: A }] }));
    expect((await loadRows(db, A)).boards).toEqual([]);
    expect((await loadRows(db, B)).boards).toHaveLength(1);
  });

  it("từ chối giá trị sai, chỉ rõ dòng nào, không ghi gì cả", async () => {
    const db = memoryRunner();
    const res = await syncRows(db, A, payload({ boards: [board1], tasks: [task("t1"), task("t2", { due_date: "." })] }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("upsert.tasks.1.due_date");
    expect(await loadRows(db, A)).toEqual({ boards: [], columns: [], tasks: [] });
  });

  it("từ chối payload hơn 200 dòng", async () => {
    const db = memoryRunner();
    const tasks = Array.from({ length: 201 }, (_, i) => task(`t${i}`));
    const res = await syncRows(db, A, payload({ tasks }));
    expect(res.ok).toBe(false);
  });

  it("từ chối body không đúng dạng", async () => {
    expect((await syncRows(memoryRunner(), A, { foo: 1 })).ok).toBe(false);
  });

  it("ghi được 200 thẻ một lần (nhiều câu INSERT, mỗi câu ≤ 100 tham số)", async () => {
    const db = memoryRunner();
    const tasks = Array.from({ length: 200 }, (_, i) => task(`t${i}`, { task_order: i }));
    expect(await syncRows(db, A, payload({ tasks }))).toEqual({ ok: true });
    expect((await loadRows(db, A)).tasks).toHaveLength(200);
  });

  it("labels/subtasks hỏng trong DB đọc ra thành mảng rỗng thay vì làm sập", async () => {
    const db = memoryRunner();
    await syncRows(db, A, payload({ tasks: [task("t1")] }));
    db.db.prepare("UPDATE tasks SET labels = 'not json', subtasks = '{}' WHERE id = 't1'").run();
    const t = (await loadRows(db, A)).tasks[0];
    expect([t.labels, t.subtasks]).toEqual([[], []]);
  });
});

describe("buildSyncStatements", () => {
  const big = payload({
    boards: [board1],
    columns: [col1],
    tasks: Array.from({ length: 150 }, (_, i) => task(`t${i}`)),
    remove: { taskIds: Array.from({ length: 150 }, (_, i) => `old${i}`) },
  });

  it("mỗi câu không vượt 100 tham số bind của D1", () => {
    for (const s of buildSyncStatements(A, big as never)) expect(s.params.length).toBeLessThanOrEqual(MAX_PARAMS);
  });

  it("mọi câu DELETE đều lọc theo owner_id, và tham số đầu là owner", () => {
    const deletes = buildSyncStatements(A, big as never).filter((s) => s.sql.startsWith("DELETE"));
    expect(deletes.length).toBeGreaterThan(1);
    for (const s of deletes) {
      expect(s.sql).toContain("WHERE owner_id = ?");
      expect(s.params[0]).toBe(A);
    }
  });

  it("mọi câu INSERT chỉ cập nhật khi owner trùng", () => {
    const inserts = buildSyncStatements(A, big as never).filter((s) => s.sql.startsWith("INSERT"));
    for (const s of inserts) expect(s.sql).toMatch(/WHERE (boards|columns|tasks)\.owner_id = excluded\.owner_id$/);
  });

  it("trường hợp xấu nhất 200 dòng vẫn ≤ 49 câu lệnh (gói D1 Free cho 50 truy vấn/lần gọi, 1 lượt đã dành cho kiểm tra token Supabase)", () => {
    const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
    const tasks200 = payload({ tasks: Array.from({ length: 200 }, (_, i) => task(`t${i}`)) });
    expect(buildSyncStatements(A, tasks200 as never).length).toBeLessThanOrEqual(49);

    const mixed = payload({
      boards: Array.from({ length: 15 }, (_, i) => ({ ...board1, id: `b${i}` })),
      columns: Array.from({ length: 25 }, (_, i) => ({ ...col1, id: `c${i}` })),
      tasks: Array.from({ length: 60 }, (_, i) => task(`t${i}`)),
      remove: { taskIds: ids("ot", 50), columnIds: ids("oc", 30), boardIds: ids("ob", 20) },
    });
    expect(buildSyncStatements(A, mixed as never).length).toBeLessThanOrEqual(49);
  });

  it("payload rỗng ⇒ không có câu nào", () => {
    expect(buildSyncStatements(A, payload() as never)).toEqual([]);
  });
});
