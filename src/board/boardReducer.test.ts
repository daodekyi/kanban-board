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
  it("seeds four numbered columns: To Do, In Progress, Review, Done", () => {
    const board = createDefaultBoard();
    expect(board.columns.map((c) => c.title)).toEqual([
      "1. To Do",
      "2. In Progress",
      "3. Review",
      "4. Done",
    ]);
    expect(board.columns.every((c) => c.cards.length === 0)).toBe(true);
    expect(board.columns[3].isDone).toBe(true);
  });
});

describe("boardReducer", () => {
  it("addColumn appends a new column with next order", () => {
    const board = createDefaultBoard();
    const next = boardReducer(board, { type: "addColumn", title: "Backlog" });
    expect(next.columns).toHaveLength(5);
    expect(next.columns[4].title).toBe("Backlog");
    expect(next.columns[4].order).toBe(4);
  });

  it("removeColumn removes the column by id", () => {
    const board = createDefaultBoard();
    const targetId = board.columns[0].id;
    const next = boardReducer(board, { type: "removeColumn", columnId: targetId });
    expect(next.columns.find((c) => c.id === targetId)).toBeUndefined();
    expect(next.columns).toHaveLength(3);
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
    expect(col.cards[0].enteredColumnAt).toEqual(expect.any(String));
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

  it("moveCard across columns refreshes enteredColumnAt", () => {
    const board = createDefaultBoard();
    const fromColumnId = board.columns[0].id;
    const toColumnId = board.columns[1].id;
    board.columns[0].cards = [
      {
        id: "card-1",
        title: "First card",
        labels: [],
        priority: "medium",
        order: 0,
        enteredColumnAt: "2020-01-01T00:00:00.000Z",
      },
    ];
    const next = boardReducer(board, {
      type: "moveCard",
      cardId: "card-1",
      fromColumnId,
      toColumnId,
      toIndex: 0,
    });
    const moved = next.columns[1].cards[0];
    expect(moved.enteredColumnAt).not.toBe("2020-01-01T00:00:00.000Z");
    expect(moved.enteredColumnAt).toEqual(expect.any(String));
  });

  it("moveCard within the same column keeps enteredColumnAt unchanged", () => {
    const board = createDefaultBoard();
    const columnId = board.columns[0].id;
    board.columns[0].cards = [
      {
        id: "a",
        title: "A",
        labels: [],
        priority: "medium",
        order: 0,
        enteredColumnAt: "2020-01-01T00:00:00.000Z",
      },
      { id: "b", title: "B", labels: [], priority: "medium", order: 1 },
    ];
    const next = boardReducer(board, {
      type: "moveCard",
      cardId: "a",
      fromColumnId: columnId,
      toColumnId: columnId,
      toIndex: 1,
    });
    const moved = next.columns[0].cards.find((c) => c.id === "a")!;
    expect(moved.enteredColumnAt).toBe("2020-01-01T00:00:00.000Z");
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

  it("setColumnDone marks a column as done", () => {
    const board = createDefaultBoard();
    const columnId = board.columns[2].id;
    const next = boardReducer(board, { type: "setColumnDone", columnId, isDone: true });
    expect(next.columns[2].isDone).toBe(true);
    expect(next.columns[0].isDone).toBeFalsy();
  });

  it("setWipLimit sets a numeric limit on a column", () => {
    const board = createDefaultBoard();
    const columnId = board.columns[0].id;
    const next = boardReducer(board, { type: "setWipLimit", columnId, wipLimit: 3 });
    expect(next.columns[0].wipLimit).toBe(3);
  });

  it("setWipLimit with undefined clears the limit", () => {
    const board = createDefaultBoard();
    const columnId = board.columns[0].id;
    const withLimit = boardReducer(board, { type: "setWipLimit", columnId, wipLimit: 3 });
    const cleared = boardReducer(withLimit, { type: "setWipLimit", columnId, wipLimit: undefined });
    expect(cleared.columns[0].wipLimit).toBeUndefined();
  });

  it("addColumn uses a preset columnId when one is given", () => {
    const board = createDefaultBoard();
    const next = boardReducer(board, { type: "addColumn", title: "Backlog", columnId: "col-preset" });
    expect(next.columns[4].id).toBe("col-preset");
  });

  it("addColumn orders after the highest existing order even after a removal", () => {
    const board = createDefaultBoard();
    const removed = boardReducer(board, { type: "removeColumn", columnId: board.columns[1].id });
    const next = boardReducer(removed, { type: "addColumn", title: "Mới" });
    const orders = next.columns.map((c) => c.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect(next.columns[next.columns.length - 1].order).toBe(4);
  });

  it("moveColumn moves a column to a new position and renumbers order", () => {
    const board = createDefaultBoard();
    const doneId = board.columns[3].id;
    const next = boardReducer(board, { type: "moveColumn", columnId: doneId, toIndex: 0 });
    expect(next.columns.map((c) => c.title)).toEqual([
      "4. Done",
      "1. To Do",
      "2. In Progress",
      "3. Review",
    ]);
    expect(next.columns.map((c) => c.order)).toEqual([0, 1, 2, 3]);
  });

  it("moveColumn clamps an out-of-range index and keeps the cards", () => {
    const board = boardWithOneCard();
    const firstId = board.columns[0].id;
    const next = boardReducer(board, { type: "moveColumn", columnId: firstId, toIndex: 99 });
    expect(next.columns[3].id).toBe(firstId);
    expect(next.columns[3].cards).toHaveLength(1);
  });

  it("moveColumn ignores an unknown column", () => {
    const board = createDefaultBoard();
    expect(boardReducer(board, { type: "moveColumn", columnId: "nope", toIndex: 0 })).toBe(board);
  });
});
