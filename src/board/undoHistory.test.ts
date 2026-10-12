import { describe, expect, it } from "vitest";
import { createDefaultAppState } from "./appReducer";
import { createDefaultBoard } from "./boardReducer";
import { createHistory, historyReducer, HISTORY_LIMIT, type HistoryState } from "./undoHistory";

function start(): HistoryState {
  return createHistory(createDefaultAppState());
}

const todoOf = (h: HistoryState) => h.present.boards[0].columns[0];

describe("historyReducer", () => {
  it("undoes and redoes a single change", () => {
    const h0 = start();
    const columnId = todoOf(h0).id;
    const h1 = historyReducer(h0, { type: "apply", actions: [{ type: "addCard", columnId, title: "A" }] });
    expect(todoOf(h1).cards).toHaveLength(1);

    const undone = historyReducer(h1, { type: "undo" });
    expect(undone.present).toBe(h0.present);

    const redone = historyReducer(undone, { type: "redo" });
    expect(redone.present).toBe(h1.present);
  });

  it("treats a batch of actions as one undo step", () => {
    const h0 = start();
    const columnId = todoOf(h0).id;
    const h1 = historyReducer(h0, {
      type: "apply",
      actions: [
        { type: "addCard", columnId, title: "A" },
        { type: "addCard", columnId, title: "B" },
        { type: "addCard", columnId, title: "C" },
      ],
    });
    expect(todoOf(h1).cards).toHaveLength(3);
    expect(todoOf(historyReducer(h1, { type: "undo" })).cards).toHaveLength(0);
  });

  it("brings back a deleted card", () => {
    const h0 = start();
    const columnId = todoOf(h0).id;
    const h1 = historyReducer(h0, { type: "apply", actions: [{ type: "addCard", columnId, title: "A" }] });
    const cardId = todoOf(h1).cards[0].id;
    const h2 = historyReducer(h1, { type: "apply", actions: [{ type: "removeCard", columnId, cardId }] });
    expect(todoOf(h2).cards).toHaveLength(0);
    expect(todoOf(historyReducer(h2, { type: "undo" })).cards[0].id).toBe(cardId);
  });

  it("does not record board switches as undo steps", () => {
    const h0 = start();
    const h1 = historyReducer(h0, { type: "apply", actions: [{ type: "addBoard", title: "B" }] });
    const firstId = h1.present.boards[0].id;
    const h2 = historyReducer(h1, { type: "apply", actions: [{ type: "switchBoard", boardId: firstId }] });
    expect(h2.past).toHaveLength(1);
    expect(h2.present.activeBoardId).toBe(firstId);
  });

  it("starts a fresh history on hydrate", () => {
    const h0 = start();
    const columnId = todoOf(h0).id;
    const h1 = historyReducer(h0, { type: "apply", actions: [{ type: "addCard", columnId, title: "A" }] });
    const remote = createDefaultBoard("Remote");
    const h2 = historyReducer(h1, {
      type: "apply",
      actions: [{ type: "hydrate", boards: [remote], activeBoardId: remote.id }],
    });
    expect(h2.past).toEqual([]);
    expect(historyReducer(h2, { type: "undo" })).toBe(h2);
  });

  it("ignores no-op actions and clears redo after a new change", () => {
    const h0 = start();
    expect(historyReducer(h0, { type: "apply", actions: [{ type: "removeBoard", boardId: "nope" }] })).toBe(h0);

    const columnId = todoOf(h0).id;
    const h1 = historyReducer(h0, { type: "apply", actions: [{ type: "addCard", columnId, title: "A" }] });
    const undone = historyReducer(h1, { type: "undo" });
    const h2 = historyReducer(undone, { type: "apply", actions: [{ type: "addCard", columnId, title: "B" }] });
    expect(h2.future).toEqual([]);
  });

  it("caps the history length", () => {
    let h = start();
    const columnId = todoOf(h).id;
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      h = historyReducer(h, { type: "apply", actions: [{ type: "addCard", columnId, title: `T${i}` }] });
    }
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
