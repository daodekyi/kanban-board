export type Priority = "low" | "medium" | "high";

export interface Card {
  id: string;
  title: string;
  description?: string;
  labels: string[];
  dueDate?: string;
  priority: Priority;
  order: number;
}

export interface Column {
  id: string;
  title: string;
  order: number;
  cards: Card[];
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
  | { type: "addCard"; columnId: string; title: string }
  | { type: "updateCard"; columnId: string; cardId: string; patch: Partial<Omit<Card, "id">> }
  | { type: "removeCard"; columnId: string; cardId: string }
  | { type: "moveCard"; cardId: string; fromColumnId: string; toColumnId: string; toIndex: number };
