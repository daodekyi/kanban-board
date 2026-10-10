import { z } from "zod";

/**
 * Lớp dữ liệu board trên D1. Không có RLS như Postgres, nên quy tắc bảo mật
 * nằm hết ở đây: owner_id LUÔN lấy từ token đã xác thực (tham số `ownerId`),
 * không bao giờ từ body; mọi DELETE lọc theo owner_id; mọi UPSERT chỉ cập nhật
 * khi owner trùng — gửi id của người khác thì câu lệnh không có tác dụng gì.
 */

export type SqlValue = string | number | null;

export interface Stmt {
  sql: string;
  params: SqlValue[];
}

/** Đủ cho cả D1 lẫn SQLite của test — logic không phụ thuộc vào D1. */
export interface SqlRunner {
  all(sql: string, params: SqlValue[]): Promise<Record<string, unknown>[]>;
  batch(stmts: Stmt[]): Promise<void>;
}

/** Giới hạn của D1: 100 tham số bind mỗi câu SQL. */
export const MAX_PARAMS = 100;
/**
 * Số dòng tối đa mỗi request. Gói Free chỉ cho 50 truy vấn mỗi lần gọi Worker;
 * 200 dòng thẻ (13 cột) ≈ 29 câu INSERT, còn dư chỗ. Frontend tự chia nhỏ.
 */
export const MAX_ROWS_PER_SYNC = 200;

const Id = z.string().min(1).max(100);
const Text = (max: number) => z.string().max(max);

const BoardRowSchema = z.object({ id: Id, title: Text(2000), board_order: z.number().int() });

const ColumnRowSchema = z.object({
  id: Id,
  board_id: Id,
  title: Text(2000),
  col_order: z.number().int(),
  is_done: z.boolean(),
  wip_limit: z.number().int().min(0).nullable(),
});

const SubtaskSchema = z.object({ id: Id, title: Text(2000), isDone: z.boolean() });

const TaskRowSchema = z.object({
  id: Id,
  column_id: Id,
  board_id: Id,
  title: Text(2000),
  description: Text(50_000).nullable(),
  labels: z.array(Text(200)).max(100),
  priority: z.enum(["low", "medium", "high"]),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "phải là YYYY-MM-DD")
    .nullable(),
  task_order: z.number().int(),
  entered_column_at: Text(40).nullable(),
  subtasks: z.array(SubtaskSchema).max(500),
  assignee: Text(500).nullable(),
});

const SyncPayloadSchema = z
  .object({
    upsert: z.object({
      boards: z.array(BoardRowSchema),
      columns: z.array(ColumnRowSchema),
      tasks: z.array(TaskRowSchema),
    }),
    remove: z.object({ boardIds: z.array(Id), columnIds: z.array(Id), taskIds: z.array(Id) }),
  })
  .refine(
    (p) =>
      p.upsert.boards.length +
        p.upsert.columns.length +
        p.upsert.tasks.length +
        p.remove.boardIds.length +
        p.remove.columnIds.length +
        p.remove.taskIds.length <=
      MAX_ROWS_PER_SYNC,
    { message: `Tối đa ${MAX_ROWS_PER_SYNC} dòng mỗi lần sync` }
  );

export type SyncPayload = z.infer<typeof SyncPayloadSchema>;

const TABLES = {
  boards: ["id", "owner_id", "title", "board_order"],
  columns: ["id", "owner_id", "board_id", "title", "col_order", "is_done", "wip_limit"],
  tasks: [
    "id",
    "owner_id",
    "board_id",
    "column_id",
    "title",
    "description",
    "labels",
    "priority",
    "due_date",
    "task_order",
    "entered_column_at",
    "subtasks",
    "assignee",
  ],
} as const;

type Table = keyof typeof TABLES;

function deleteStatements(table: Table, ownerId: string, ids: string[]): Stmt[] {
  const out: Stmt[] = [];
  const perStmt = MAX_PARAMS - 1; // 1 chỗ cho owner_id
  for (let i = 0; i < ids.length; i += perStmt) {
    const chunk = ids.slice(i, i + perStmt);
    out.push({
      sql: `DELETE FROM ${table} WHERE owner_id = ? AND id IN (${chunk.map(() => "?").join(", ")})`,
      params: [ownerId, ...chunk],
    });
  }
  return out;
}

function upsertStatements(table: Table, rows: SqlValue[][]): Stmt[] {
  const cols = TABLES[table];
  const perStmt = Math.floor(MAX_PARAMS / cols.length);
  const placeholders = `(${cols.map(() => "?").join(", ")})`;
  const updates = cols
    .filter((c) => c !== "id" && c !== "owner_id")
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");
  const out: Stmt[] = [];
  for (let i = 0; i < rows.length; i += perStmt) {
    const chunk = rows.slice(i, i + perStmt);
    out.push({
      // WHERE ở nhánh DO UPDATE: id đã thuộc về người khác thì bỏ qua, không đè.
      sql:
        `INSERT INTO ${table} (${cols.join(", ")}) VALUES ${chunk.map(() => placeholders).join(", ")} ` +
        `ON CONFLICT(id) DO UPDATE SET ${updates} WHERE ${table}.owner_id = excluded.owner_id`,
      params: chunk.flat(),
    });
  }
  return out;
}

export function buildSyncStatements(ownerId: string, p: SyncPayload): Stmt[] {
  return [
    ...deleteStatements("tasks", ownerId, p.remove.taskIds),
    ...deleteStatements("columns", ownerId, p.remove.columnIds),
    ...deleteStatements("boards", ownerId, p.remove.boardIds),
    ...upsertStatements(
      "boards",
      p.upsert.boards.map((b) => [b.id, ownerId, b.title, b.board_order])
    ),
    ...upsertStatements(
      "columns",
      p.upsert.columns.map((c) => [c.id, ownerId, c.board_id, c.title, c.col_order, c.is_done ? 1 : 0, c.wip_limit])
    ),
    ...upsertStatements(
      "tasks",
      p.upsert.tasks.map((t) => [
        t.id,
        ownerId,
        t.board_id,
        t.column_id,
        t.title,
        t.description,
        JSON.stringify(t.labels),
        t.priority,
        t.due_date,
        t.task_order,
        t.entered_column_at,
        JSON.stringify(t.subtasks),
        t.assignee,
      ])
    ),
  ];
}

function parseJsonArray(value: unknown): unknown[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadRows(db: SqlRunner, ownerId: string) {
  const [boards, columns, tasks] = await Promise.all([
    db.all("SELECT id, title, board_order FROM boards WHERE owner_id = ?", [ownerId]),
    db.all("SELECT id, board_id, title, col_order, is_done, wip_limit FROM columns WHERE owner_id = ?", [ownerId]),
    db.all(
      "SELECT id, column_id, board_id, title, description, labels, priority, due_date, task_order, " +
        "entered_column_at, subtasks, assignee FROM tasks WHERE owner_id = ?",
      [ownerId]
    ),
  ]);
  return {
    boards: boards.map((b) => ({ ...b })),
    columns: columns.map((c) => ({ ...c, is_done: c.is_done === 1 })),
    tasks: tasks.map((t) => ({ ...t, labels: parseJsonArray(t.labels), subtasks: parseJsonArray(t.subtasks) })),
  };
}

export async function syncRows(
  db: SqlRunner,
  ownerId: string,
  body: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SyncPayloadSchema.safeParse(body);
  if (!parsed.success) {
    // Nêu rõ dòng nào sai (vd "upsert.tasks.3.due_date") — lỗi sync im lặng là
    // thứ từng khiến cả batch Postgres bị từ chối mà không ai biết.
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Dữ liệu sync không hợp lệ — ${detail}` };
  }
  const stmts = buildSyncStatements(ownerId, parsed.data);
  if (stmts.length > 0) await db.batch(stmts);
  return { ok: true };
}

export function d1Runner(db: D1Database): SqlRunner {
  return {
    async all(sql, params) {
      const result = await db.prepare(sql).bind(...params).all();
      return result.results as Record<string, unknown>[];
    },
    async batch(stmts) {
      await db.batch(stmts.map((s) => db.prepare(s.sql).bind(...s.params)));
    },
  };
}
