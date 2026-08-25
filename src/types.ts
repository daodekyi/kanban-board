export type Priority = "low" | "medium" | "high";

export interface Subtask {
  id: string;
  title: string;
  isDone: boolean;
}

export interface Card {
  id: string;
  title: string;
  description?: string;
  labels: string[];
  dueDate?: string;
  priority: Priority;
  order: number;
  enteredColumnAt?: string;
  subtasks?: Subtask[];
  assignee?: string;
}

export interface Column {
  id: string;
  title: string;
  order: number;
  cards: Card[];
  isDone?: boolean;
  wipLimit?: number;
}

export interface Board {
  id: string;
  title: string;
  columns: Column[];
}

export type BoardAction =
  | { type: "addColumn"; title: string }
  | { type: "removeColumn"; columnId: string }
  | { type: "renameColumn"; columnId: string; title: string }
  | {
      type: "addCard";
      columnId: string;
      title: string;
      patch?: Partial<Pick<Card, "description" | "labels" | "dueDate" | "priority" | "assignee" | "subtasks">>;
    }
  | { type: "updateCard"; columnId: string; cardId: string; patch: Partial<Omit<Card, "id">> }
  | { type: "removeCard"; columnId: string; cardId: string }
  | { type: "moveCard"; cardId: string; fromColumnId: string; toColumnId: string; toIndex: number }
  | { type: "setColumnDone"; columnId: string; isDone: boolean }
  | { type: "setWipLimit"; columnId: string; wipLimit?: number };
