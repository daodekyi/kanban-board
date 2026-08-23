import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import type { Board, Card, Column, Priority } from "../types";
import { appReducer, createDefaultAppState, migrateToAppState, type AppAction, type AppState } from "./appReducer";
import { createDefaultBoard } from "./boardReducer";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";

interface BoardContextValue {
  board: Board;
  boards: Board[];
  dispatch: React.Dispatch<AppAction>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

interface BoardRow {
  id: string;
  title: string;
  board_order: number;
}

interface ColumnRow {
  id: string;
  board_id: string;
  title: string;
  col_order: number;
  is_done: boolean;
  wip_limit: number | null;
}

interface TaskRow {
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
}

function assembleBoards(boardRows: BoardRow[], columnRows: ColumnRow[], taskRows: TaskRow[]): Board[] {
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

function flattenBoards(boards: Board[], ownerId: string) {
  const boardRows = boards.map((b, i) => ({ id: b.id, owner_id: ownerId, title: b.title, board_order: i }));
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
        });
      });
    });
  });

  return { boardRows, columnRows, taskRows };
}

function readLegacyLocalStorageBoards(): Board[] | null {
  const raw = window.localStorage.getItem("kanban-board");
  if (!raw) return null;
  try {
    const state: AppState = migrateToAppState(JSON.parse(raw));
    return state.boards.length > 0 ? state.boards : null;
  } catch {
    return null;
  }
}

export function BoardProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(appReducer, null, createDefaultAppState);
  const [ready, setReady] = useState(false);
  const prevIdsRef = useRef<{ boards: Set<string>; columns: Set<string>; tasks: Set<string> }>({
    boards: new Set(),
    columns: new Set(),
    tasks: new Set(),
  });
  const hydratingRef = useRef(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setReady(false);
    hydratingRef.current = true;

    (async () => {
      const { data: boardRows, error: boardsError } = await supabase
        .from("boards")
        .select("id, title, board_order")
        .eq("owner_id", user.id);

      if (boardsError) {
        console.error("Failed to load boards from Supabase", boardsError);
        return;
      }
      if (cancelled) return;

      let boards: Board[];

      if (boardRows && boardRows.length > 0) {
        const boardIds = boardRows.map((b) => b.id);
        const [columnsResult, tasksResult] = await Promise.all([
          supabase
            .from("columns")
            .select("id, board_id, title, col_order, is_done, wip_limit")
            .in("board_id", boardIds),
          supabase
            .from("tasks")
            .select("id, column_id, board_id, title, description, labels, priority, due_date, task_order, entered_column_at")
            .in("board_id", boardIds),
        ]);

        if (columnsResult.error || tasksResult.error) {
          console.error(
            "Failed to load board contents from Supabase",
            columnsResult.error ?? tasksResult.error
          );
          return;
        }
        if (cancelled) return;

        boards = assembleBoards(
          boardRows as BoardRow[],
          (columnsResult.data ?? []) as ColumnRow[],
          (tasksResult.data ?? []) as TaskRow[]
        );
      } else {
        boards = readLegacyLocalStorageBoards() ?? [createDefaultBoard()];
        const { boardRows: newBoardRows, columnRows: newColumnRows, taskRows: newTaskRows } = flattenBoards(
          boards,
          user.id
        );

        const { error: insertBoardsError } = await supabase.from("boards").insert(newBoardRows);
        if (insertBoardsError) {
          console.error("Failed to migrate boards to Supabase", insertBoardsError);
        } else {
          if (newColumnRows.length > 0) {
            const { error: insertColumnsError } = await supabase.from("columns").insert(newColumnRows);
            if (insertColumnsError) console.error("Failed to migrate columns to Supabase", insertColumnsError);
          }
          if (newTaskRows.length > 0) {
            const { error: insertTasksError } = await supabase.from("tasks").insert(newTaskRows);
            if (insertTasksError) console.error("Failed to migrate tasks to Supabase", insertTasksError);
          }
          window.localStorage.removeItem("kanban-board");
        }
      }

      prevIdsRef.current = {
        boards: new Set(boards.map((b) => b.id)),
        columns: new Set(boards.flatMap((b) => b.columns.map((c) => c.id))),
        tasks: new Set(boards.flatMap((b) => b.columns.flatMap((c) => c.cards.map((t) => t.id)))),
      };
      dispatch({ type: "hydrate", boards, activeBoardId: boards[0].id });
      hydratingRef.current = false;
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !ready || hydratingRef.current) return;

    const currentBoardIds = new Set(state.boards.map((b) => b.id));
    const currentColumnIds = new Set(state.boards.flatMap((b) => b.columns.map((c) => c.id)));
    const currentTaskIds = new Set(
      state.boards.flatMap((b) => b.columns.flatMap((c) => c.cards.map((t) => t.id)))
    );

    const removedBoardIds = [...prevIdsRef.current.boards].filter((id) => !currentBoardIds.has(id));
    const removedColumnIds = [...prevIdsRef.current.columns].filter((id) => !currentColumnIds.has(id));
    const removedTaskIds = [...prevIdsRef.current.tasks].filter((id) => !currentTaskIds.has(id));

    prevIdsRef.current = { boards: currentBoardIds, columns: currentColumnIds, tasks: currentTaskIds };

    (async () => {
      if (removedTaskIds.length > 0) {
        const { error } = await supabase.from("tasks").delete().in("id", removedTaskIds);
        if (error) console.error("Failed to delete tasks from Supabase", error);
      }
      if (removedColumnIds.length > 0) {
        const { error } = await supabase.from("columns").delete().in("id", removedColumnIds);
        if (error) console.error("Failed to delete columns from Supabase", error);
      }
      if (removedBoardIds.length > 0) {
        const { error } = await supabase.from("boards").delete().in("id", removedBoardIds);
        if (error) console.error("Failed to delete boards from Supabase", error);
      }

      const { boardRows, columnRows, taskRows } = flattenBoards(state.boards, user.id);

      if (boardRows.length > 0) {
        const { error } = await supabase.from("boards").upsert(boardRows, { onConflict: "id" });
        if (error) console.error("Failed to sync boards to Supabase", error);
      }
      if (columnRows.length > 0) {
        const { error } = await supabase.from("columns").upsert(columnRows, { onConflict: "id" });
        if (error) console.error("Failed to sync columns to Supabase", error);
      }
      if (taskRows.length > 0) {
        const { error } = await supabase.from("tasks").upsert(taskRows, { onConflict: "id" });
        if (error) console.error("Failed to sync tasks to Supabase", error);
      }
    })();
  }, [state, user, ready]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
        Đang tải dữ liệu...
      </div>
    );
  }

  const activeBoard = state.boards.find((b) => b.id === state.activeBoardId) ?? state.boards[0];

  return (
    <BoardContext.Provider value={{ board: activeBoard, boards: state.boards, dispatch }}>
      {children}
    </BoardContext.Provider>
  );
}

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used within a BoardProvider");
  return ctx;
}
