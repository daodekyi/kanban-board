import { describe, expect, it } from "vitest";
import {
  describeDestructiveAction,
  isDestructiveAction,
  sanitizeAgentActions,
} from "./agentActions";
import type { AppAction } from "./appReducer";
import type { Board } from "../types";

const CARD_ID = "card-1";
const COLUMN_ID = "col-1";
const BOARD_ID = "board-1";

function makeBoard(): Board {
  return {
    id: BOARD_ID,
    title: "Board",
    columns: [
      {
        id: COLUMN_ID,
        title: "To Do",
        order: 0,
        cards: [
          {
            id: CARD_ID,
            title: "Viết báo cáo",
            labels: [],
            priority: "medium",
            order: 0,
            dueDate: "2026-08-30",
            subtasks: [{ id: "sub-1", title: "Thu thập số liệu", isDone: false }],
          },
        ],
      },
    ],
  };
}

function sanitize(action: unknown) {
  const board = makeBoard();
  return sanitizeAgentActions([action as AppAction], board, [board]).actions;
}

const OTHER_COLUMN_ID = "col-2";
const OTHER_BOARD_ID = "board-2";

/** A second board the user isn't currently looking at. */
function makeOtherBoard(): Board {
  return {
    id: OTHER_BOARD_ID,
    title: "Project B",
    columns: [
      { id: OTHER_COLUMN_ID, title: "In Progress", order: 0, cards: [] },
    ],
  };
}

describe("sanitizeAgentActions", () => {
  it("applies only the fields the agent actually listed", () => {
    const [action] = sanitize({
      type: "updateCard",
      columnId: COLUMN_ID,
      cardId: CARD_ID,
      patch: [{ field: "priority", value: "high" }],
    });

    expect(action).toEqual({
      type: "updateCard",
      columnId: COLUMN_ID,
      cardId: CARD_ID,
      patch: { priority: "high" },
    });
  });

  it("drops placeholder values that would wipe real card data", () => {
    const [action] = sanitize({
      type: "updateCard",
      columnId: COLUMN_ID,
      cardId: CARD_ID,
      patch: [
        { field: "priority", value: "high" },
        { field: "title", value: "." },
        { field: "dueDate", value: "." },
      ],
    });

    expect(action).toEqual({
      type: "updateCard",
      columnId: COLUMN_ID,
      cardId: CARD_ID,
      patch: { priority: "high" },
    });
  });

  it("rejects a malformed due date rather than syncing it to the database", () => {
    const result = sanitize({
      type: "updateCard",
      columnId: COLUMN_ID,
      cardId: CARD_ID,
      patch: [{ field: "dueDate", value: "30/08/2026" }],
    });

    expect(result).toEqual([]);
  });

  it("rejects an invalid priority instead of writing null to a NOT NULL column", () => {
    const result = sanitize({
      type: "updateCard",
      columnId: COLUMN_ID,
      cardId: CARD_ID,
      patch: [{ field: "priority", value: null }],
    });

    expect(result).toEqual([]);
  });

  it("drops actions referencing a card that does not exist", () => {
    const result = sanitize({
      type: "updateCard",
      columnId: COLUMN_ID,
      cardId: "hallucinated-id",
      patch: [{ field: "priority", value: "high" }],
    });

    expect(result).toEqual([]);
  });

  it("keeps ids of existing subtasks but reissues invented ones", () => {
    const [action] = sanitize({
      type: "updateCard",
      columnId: COLUMN_ID,
      cardId: CARD_ID,
      patch: [
        {
          field: "subtasks",
          value: [
            { id: "sub-1", title: "Thu thập số liệu", isDone: true },
            { id: "made-up", title: "Viết bản nháp", isDone: false },
          ],
        },
      ],
    });

    const subtasks = (action as Extract<AppAction, { type: "updateCard" }>).patch.subtasks!;
    expect(subtasks[0]).toEqual({ id: "sub-1", title: "Thu thập số liệu", isDone: true });
    expect(subtasks[1].id).not.toBe("made-up");
    expect(subtasks[1].title).toBe("Viết bản nháp");
  });

  it("translates clearWipLimit into the reducer's undefined-limit form", () => {
    const [action] = sanitize({ type: "clearWipLimit", columnId: COLUMN_ID });

    expect(action).toEqual({ type: "setWipLimit", columnId: COLUMN_ID, wipLimit: undefined });
  });

  it("flags every deletion so it can be held for confirmation", () => {
    expect(isDestructiveAction({ type: "removeCard", columnId: COLUMN_ID, cardId: CARD_ID })).toBe(true);
    expect(isDestructiveAction({ type: "removeColumn", columnId: COLUMN_ID })).toBe(true);
    expect(isDestructiveAction({ type: "removeBoard", boardId: BOARD_ID })).toBe(true);
  });

  it("does not flag non-destructive actions", () => {
    expect(
      isDestructiveAction({
        type: "updateCard",
        columnId: COLUMN_ID,
        cardId: CARD_ID,
        patch: { priority: "high" },
      })
    ).toBe(false);
    expect(
      isDestructiveAction({
        type: "moveCard",
        cardId: CARD_ID,
        fromColumnId: COLUMN_ID,
        toColumnId: COLUMN_ID,
        toIndex: 0,
      })
    ).toBe(false);
  });

  it("names what a deletion removes so the confirmation is specific", () => {
    const board = makeBoard();

    expect(
      describeDestructiveAction({ type: "removeCard", columnId: COLUMN_ID, cardId: CARD_ID }, board, [board])
    ).toContain("Viết báo cáo");

    expect(
      describeDestructiveAction({ type: "removeColumn", columnId: COLUMN_ID }, board, [board])
    ).toContain("1 thẻ");
  });

  it("does not mention a card count when the board is empty", () => {
    const empty: Board = { id: "board-2", title: "Trống", columns: [] };

    expect(describeDestructiveAction({ type: "removeBoard", boardId: "board-2" }, empty, [empty])).toBe(
      'Xóa board "Trống"'
    );
  });

  it("switches to the owning board before acting on another board's column", () => {
    const active = makeBoard();
    const other = makeOtherBoard();

    const { actions, dropped } = sanitizeAgentActions(
      [{ type: "removeColumn", columnId: OTHER_COLUMN_ID }],
      active,
      [active, other]
    );

    expect(dropped).toBe(0);
    expect(actions).toEqual([
      { type: "switchBoard", boardId: OTHER_BOARD_ID },
      { type: "removeColumn", columnId: OTHER_COLUMN_ID },
    ]);
  });

  it("does not switch boards for a column on the board already open", () => {
    const active = makeBoard();
    const other = makeOtherBoard();

    const { actions } = sanitizeAgentActions([{ type: "removeColumn", columnId: COLUMN_ID }], active, [
      active,
      other,
    ]);

    expect(actions).toEqual([{ type: "removeColumn", columnId: COLUMN_ID }]);
  });

  it("says which board a cross-board deletion belongs to", () => {
    const active = makeBoard();
    const other = makeOtherBoard();

    expect(
      describeDestructiveAction({ type: "removeColumn", columnId: OTHER_COLUMN_ID }, active, [
        active,
        other,
      ])
    ).toBe('Xóa cột "In Progress" (board "Project B")');
  });

  it("reports how many proposed actions were rejected", () => {
    const active = makeBoard();

    const { actions, dropped } = sanitizeAgentActions(
      [
        { type: "removeCard", columnId: COLUMN_ID, cardId: "khong-ton-tai" },
        { type: "removeCard", columnId: COLUMN_ID, cardId: CARD_ID },
      ],
      active,
      [active]
    );

    expect(dropped).toBe(1);
    expect(actions).toHaveLength(1);
  });

  it("clamps an out-of-range move index to the target column", () => {
    const [action] = sanitize({
      type: "moveCard",
      cardId: CARD_ID,
      fromColumnId: COLUMN_ID,
      toColumnId: COLUMN_ID,
      toIndex: 99,
    });

    expect((action as Extract<AppAction, { type: "moveCard" }>).toIndex).toBe(1);
  });
});
