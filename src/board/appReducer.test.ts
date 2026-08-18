import { describe, it, expect } from "vitest";
import { appReducer, createDefaultAppState, migrateToAppState } from "./appReducer";
import { createDefaultBoard } from "./boardReducer";
import type { AppState } from "./appReducer";

describe("createDefaultAppState", () => {
  it("creates a single default board and marks it active", () => {
    const state = createDefaultAppState();
    expect(state.boards).toHaveLength(1);
    expect(state.activeBoardId).toBe(state.boards[0].id);
  });
});

describe("migrateToAppState", () => {
  it("returns default state for null/undefined input", () => {
    const state = migrateToAppState(null);
    expect(state.boards).toHaveLength(1);
  });

  it("wraps a legacy single-board shape into AppState", () => {
    const legacyBoard = createDefaultBoard("Legacy");
    const state = migrateToAppState(legacyBoard);
    expect(state.boards).toEqual([legacyBoard]);
    expect(state.activeBoardId).toBe(legacyBoard.id);
  });

  it("passes through an already-migrated AppState shape", () => {
    const existing: AppState = {
      boards: [createDefaultBoard("A"), createDefaultBoard("B")],
      activeBoardId: "some-id",
    };
    const state = migrateToAppState(existing);
    expect(state).toEqual(existing);
  });
});

describe("appReducer", () => {
  it("addBoard appends a new board and makes it active", () => {
    const state = createDefaultAppState();
    const next = appReducer(state, { type: "addBoard", title: "Marketing" });
    expect(next.boards).toHaveLength(2);
    expect(next.boards[1].title).toBe("Marketing");
    expect(next.activeBoardId).toBe(next.boards[1].id);
  });

  it("renameBoard updates the board title", () => {
    const state = createDefaultAppState();
    const boardId = state.boards[0].id;
    const next = appReducer(state, { type: "renameBoard", boardId, title: "Renamed" });
    expect(next.boards[0].title).toBe("Renamed");
  });

  it("switchBoard changes the active board", () => {
    const state = createDefaultAppState();
    const withSecond = appReducer(state, { type: "addBoard", title: "Second" });
    const firstId = withSecond.boards[0].id;
    const next = appReducer(withSecond, { type: "switchBoard", boardId: firstId });
    expect(next.activeBoardId).toBe(firstId);
  });

  it("removeBoard removes a board and switches active if needed", () => {
    const state = createDefaultAppState();
    const withSecond = appReducer(state, { type: "addBoard", title: "Second" });
    const activeId = withSecond.activeBoardId;
    const next = appReducer(withSecond, { type: "removeBoard", boardId: activeId });
    expect(next.boards).toHaveLength(1);
    expect(next.activeBoardId).toBe(next.boards[0].id);
  });

  it("removeBoard refuses to remove the last remaining board", () => {
    const state = createDefaultAppState();
    const next = appReducer(state, { type: "removeBoard", boardId: state.boards[0].id });
    expect(next.boards).toHaveLength(1);
  });

  it("routes a BoardAction to the active board only", () => {
    const state = createDefaultAppState();
    const withSecond = appReducer(state, { type: "addBoard", title: "Second" });
    const activeId = withSecond.activeBoardId;
    const columnId = withSecond.boards.find((b) => b.id === activeId)!.columns[0].id;

    const next = appReducer(withSecond, { type: "addCard", columnId, title: "New task" });

    const activeBoard = next.boards.find((b) => b.id === activeId)!;
    const otherBoard = next.boards.find((b) => b.id !== activeId)!;
    expect(activeBoard.columns[0].cards).toHaveLength(1);
    expect(otherBoard.columns[0].cards).toHaveLength(0);
  });
});
