import type { Board, Card, Column, Priority, Subtask } from "../types";

/** Dạng dòng bảng — trùng tên cột với D1 (và Postgres cũ). Không có owner_id: Worker tự gán từ token. */
export interface BoardRow {
  id: string;
  title: string;
  board_order: number;
}

export interface ColumnRow {
  id: string;
  board_id: string;
  title: string;
  col_order: number;
  is_done: boolean;
  wip_limit: number | null;
}

export interface TaskRow {
  id: string;
  column_id: string;
  board_id: string;
  title: string;
  description: string | null;
  labels: string[];
  priority: string;
  due_date: string | null;
  task_order: number;
  entered_column_at: string | null;
  subtasks: Subtask[] | null;
  assignee: string | null;
}

export interface Rows {
  boards: BoardRow[];
  columns: ColumnRow[];
  tasks: TaskRow[];
}

export interface SyncPayload {
  upsert: Rows;
  remove: { boardIds: string[]; columnIds: string[]; taskIds: string[] };
}

/** Phải khớp MAX_ROWS_PER_SYNC trong worker/src/data.ts. */
export const MAX_ROWS_PER_SYNC = 200;

export function assembleBoards({ boards: boardRows, columns: columnRows, tasks: taskRows }: Rows): Board[] {
  const cardsByColumn = new Map<string, Card[]>();
  for (const t of taskRows) {
    const card: Card = {
      id: t.id,
      title: t.title,
      description: t.description ?? undefined,
      labels: t.labels ?? [],
      dueDate: t.due_date ?? undefined,
      priority: t.priority as Priority,
      order: t.task_order,
      enteredColumnAt: t.entered_column_at ?? undefined,
      subtasks: t.subtasks ?? [],
      assignee: t.assignee ?? undefined,
    };
    const list = cardsByColumn.get(t.column_id);
    if (list) list.push(card);
    else cardsByColumn.set(t.column_id, [card]);
  }
  for (const list of cardsByColumn.values()) list.sort((a, b) => a.order - b.order);

  const columnsByBoard = new Map<string, Column[]>();
  for (const c of columnRows) {
    const column: Column = {
      id: c.id,
      title: c.title,
      order: c.col_order,
      cards: cardsByColumn.get(c.id) ?? [],
      isDone: c.is_done,
      wipLimit: c.wip_limit ?? undefined,
    };
    const list = columnsByBoard.get(c.board_id);
    if (list) list.push(column);
    else columnsByBoard.set(c.board_id, [column]);
  }
  for (const list of columnsByBoard.values()) list.sort((a, b) => a.order - b.order);

  return boardRows
    .slice()
    .sort((a, b) => a.board_order - b.board_order)
    .map((b) => ({ id: b.id, title: b.title, columns: columnsByBoard.get(b.id) ?? [] }));
}

export function flattenBoards(boards: Board[]): Rows {
  const boardRows: BoardRow[] = boards.map((b, i) => ({ id: b.id, title: b.title, board_order: i }));
  const columnRows: ColumnRow[] = [];
  const taskRows: TaskRow[] = [];

  boards.forEach((b) => {
    b.columns.forEach((c, ci) => {
      columnRows.push({
        id: c.id,
        board_id: b.id,
        title: c.title,
        col_order: c.order ?? ci,
        is_done: c.isDone ?? false,
        wip_limit: c.wipLimit ?? null,
      });
      c.cards.forEach((card, cardi) => {
        taskRows.push({
          id: card.id,
          column_id: c.id,
          board_id: b.id,
          title: card.title,
          description: card.description ?? null,
          labels: card.labels ?? [],
          priority: card.priority,
          due_date: card.dueDate ?? null,
          task_order: card.order ?? cardi,
          entered_column_at: card.enteredColumnAt ?? null,
          subtasks: card.subtasks ?? [],
          assignee: card.assignee ?? null,
        });
      });
    });
  });

  return { boards: boardRows, columns: columnRows, tasks: taskRows };
}

/** id → JSON của dòng ở lần sync thành công gần nhất. So JSON là đủ vì flattenBoards luôn dựng key cùng thứ tự. */
export interface RowSnapshot {
  boards: ReadonlyMap<string, string>;
  columns: ReadonlyMap<string, string>;
  tasks: ReadonlyMap<string, string>;
}

export const EMPTY_SNAPSHOT: RowSnapshot = { boards: new Map(), columns: new Map(), tasks: new Map() };

export function snapshotRows(rows: Rows): RowSnapshot {
  const toMap = (list: { id: string }[]) => new Map(list.map((r) => [r.id, JSON.stringify(r)]));
  return { boards: toMap(rows.boards), columns: toMap(rows.columns), tasks: toMap(rows.tasks) };
}

function changed<T extends { id: string }>(prev: ReadonlyMap<string, string>, next: T[]): T[] {
  return next.filter((r) => prev.get(r.id) !== JSON.stringify(r));
}

function removed(prev: ReadonlyMap<string, string>, next: { id: string }[]): string[] {
  const keep = new Set(next.map((r) => r.id));
  return [...prev.keys()].filter((id) => !keep.has(id));
}

export function diffRows(prev: RowSnapshot, next: Rows): SyncPayload {
  return {
    upsert: {
      boards: changed(prev.boards, next.boards),
      columns: changed(prev.columns, next.columns),
      tasks: changed(prev.tasks, next.tasks),
    },
    remove: {
      boardIds: removed(prev.boards, next.boards),
      columnIds: removed(prev.columns, next.columns),
      taskIds: removed(prev.tasks, next.tasks),
    },
  };
}

export function payloadSize(p: SyncPayload): number {
  return (
    p.upsert.boards.length +
    p.upsert.columns.length +
    p.upsert.tasks.length +
    p.remove.boardIds.length +
    p.remove.columnIds.length +
    p.remove.taskIds.length
  );
}

export function isEmptyPayload(p: SyncPayload): boolean {
  return payloadSize(p) === 0;
}

type Item =
  | { kind: "taskId"; id: string }
  | { kind: "columnId"; id: string }
  | { kind: "boardId"; id: string }
  | { kind: "task"; row: TaskRow }
  | { kind: "column"; row: ColumnRow }
  | { kind: "board"; row: BoardRow };

/**
 * Chia payload thành các request ≤ maxRows dòng. Thứ tự cố ý: xóa trước, rồi
 * thẻ, cột, và board SAU CÙNG — nếu lần chuyển dữ liệu đầu tiên bị đứt giữa
 * chừng thì D1 vẫn "chưa có board", lần tải sau sẽ chuyển lại từ đầu (upsert
 * lặp lại vô hại) thay vì để lại một board thiếu thẻ.
 */
export function chunkPayload(p: SyncPayload, maxRows = MAX_ROWS_PER_SYNC): SyncPayload[] {
  const items: Item[] = [
    ...p.remove.taskIds.map((id) => ({ kind: "taskId" as const, id })),
    ...p.remove.columnIds.map((id) => ({ kind: "columnId" as const, id })),
    ...p.remove.boardIds.map((id) => ({ kind: "boardId" as const, id })),
    ...p.upsert.tasks.map((row) => ({ kind: "task" as const, row })),
    ...p.upsert.columns.map((row) => ({ kind: "column" as const, row })),
    ...p.upsert.boards.map((row) => ({ kind: "board" as const, row })),
  ];
  const chunks: SyncPayload[] = [];
  for (let i = 0; i < items.length; i += maxRows) {
    const c: SyncPayload = {
      upsert: { boards: [], columns: [], tasks: [] },
      remove: { boardIds: [], columnIds: [], taskIds: [] },
    };
    for (const it of items.slice(i, i + maxRows)) {
      if (it.kind === "taskId") c.remove.taskIds.push(it.id);
      else if (it.kind === "columnId") c.remove.columnIds.push(it.id);
      else if (it.kind === "boardId") c.remove.boardIds.push(it.id);
      else if (it.kind === "task") c.upsert.tasks.push(it.row);
      else if (it.kind === "column") c.upsert.columns.push(it.row);
      else c.upsert.boards.push(it.row);
    }
    chunks.push(c);
  }
  return chunks;
}
