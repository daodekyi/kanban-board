import { describe, it, expect } from "vitest";
import { boardReducer, createDefaultBoard } from "./boardReducer";
import type { Board } from "../types";

function boardWithOneCard(): Board {
  const base = createDefaultBoard();
  const col = base.columns[0];
  col.cards.push({
    id: "card-1",
    title: "First card",
    labels: [],
    priority: "medium",
    order: 0,
  });
  return base;
}

describe("createDefaultBoard", () => {
  it("seeds three columns: To Do, In Progress, Done", () => {
    const board = createDefaultBoard();
    expect(board.columns.map((c) => c.title)).toEqual(["To Do", "In Progress", "Done"]);
    expect(board.columns.every((c) => c.cards.length === 0)).toBe(true);
  });
});

describe("boardReducer", () => {
  it("addColumn appends a new column with next order", () => {
    const board = createDefaultBoard();
    const next = boardReducer(board, { type: "addColumn", title: "Backlog" });
    expect(next.columns).toHaveLength(4);
    expect(next.columns[3].title).toBe("Backlog");
    expect(next.columns[3].order).toBe(3);
  });

  it("removeColumn removes the column by id", () => {
    const board = createDefaultBoard();
    const targetId = board.columns[0].id;
    const next = boardReducer(board, { type: "removeColumn", columnId: targetId });
    expect(next.columns.find((c) => c.id === targetId)).toBeUndefined();
    expect(next.columns).toHaveLength(2);
  });

  it("renameColumn updates the title", () => {
    const board = createDefaultBoard();
    const targetId = board.columns[0].id;
    const next = boardReducer(board, { type: "renameColumn", columnId: targetId, title: "Doing" });
    expect(next.columns.find((c) => c.id === targetId)?.title).toBe("Doing");
  });

  it("addCard appends a card to the given column", () => {
    const board = createDefaultBoard();
    const columnId = board.columns[0].id;
    const next = boardReducer(board, { type: "addCard", columnId, title: "New task" });
    const col = next.columns.find((c) => c.id === columnId)!;
    expect(col.cards).toHaveLength(1);
    expect(col.cards[0].title).toBe("New task");
    expect(col.cards[0].priority).toBe("medium");
    expect(col.cards[0].labels).toEqual([]);
  });

  it("updateCard patches fields on the matching card", () => {
    const board = boardWithOneCard();
    const columnId = board.columns[0].id;
    const next = boardReducer(board, {
      type: "updateCard",
      columnId,
      cardId: "card-1",
      patch: { title: "Updated", priority: "high", dueDate: "2026-09-01" },
    });
    const card = next.columns[0].cards.find((c) => c.id === "card-1")!;
    expect(card.title).toBe("Updated");
    expect(card.priority).toBe("high");
    expect(card.dueDate).toBe("2026-09-01");
  });

  it("removeCard removes the card from its column", () => {
    const board = boardWithOneCard();
    const columnId = board.columns[0].id;
    const next = boardReducer(board, { type: "removeCard", columnId, cardId: "card-1" });
    expect(next.columns[0].cards).toHaveLength(0);
  });

  it("moveCard moves a card between columns and reorders", () => {
    const board = boardWithOneCard();
    const fromColumnId = board.columns[0].id;
    const toColumnId = board.columns[1].id;
    const next = boardReducer(board, {
      type: "moveCard",
      cardId: "card-1",
      fromColumnId,
      toColumnId,
      toIndex: 0,
    });
    expect(next.columns[0].cards).toHaveLength(0);
    expect(next.columns[1].cards).toHaveLength(1);
    expect(next.columns[1].cards[0].id).toBe("card-1");
  });

  it("moveCard reorders within the same column", () => {
    const board = createDefaultBoard();
    const columnId = board.columns[0].id;
    board.columns[0].cards = [
      { id: "a", title: "A", labels: [], priority: "medium", order: 0 },
      { id: "b", title: "B", labels: [], priority: "medium", order: 1 },
    ];
    const next = boardReducer(board, {
      type: "moveCard",
      cardId: "b",
      fromColumnId: columnId,
      toColumnId: columnId,
      toIndex: 0,
    });
    expect(next.columns[0].cards.map((c) => c.id)).toEqual(["b", "a"]);
  });
});
