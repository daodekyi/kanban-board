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

describe("sanitizeAgentActions — nhiều bước trong một lượt", () => {
  it("lets cards target a board created earlier in the same reply via its ref", () => {
    const active = makeBoard();
    const { actions, dropped } = sanitizeAgentActions(
      [
        {
          type: "addBoard",
          title: "Du lịch Đà Lạt",
          ref: "b-dalat",
          columns: [
            { title: "Cần làm", ref: "c-todo", isDone: false },
            { title: "Xong", ref: "c-done", isDone: true },
          ],
        },
        { type: "addCard", columnId: "c-todo", title: "Đặt vé", patch: [] },
        { type: "addCard", columnId: "c-todo", title: "Đặt phòng", patch: [] },
      ] as unknown as AppAction[],
      active,
      [active]
    );

    expect(dropped).toBe(0);
    const add = actions[0] as Extract<AppAction, { type: "addBoard" }>;
    const todoId = add.columns![0].id;
    expect(add.boardId).toBeTruthy();
    expect(todoId).not.toBe("c-todo");
    expect(add.columns!.map((c) => [c.title, c.isDone])).toEqual([
      ["Cần làm", false],
      ["Xong", true],
    ]);
    // addBoard đã tự mở board mới, nên không cần switchBoard chen vào.
    expect(actions.slice(1)).toEqual([
      { type: "addCard", columnId: todoId, title: "Đặt vé", patch: {} },
      { type: "addCard", columnId: todoId, title: "Đặt phòng", patch: {} },
    ]);
  });

  it("switches back before touching the old board after creating a new one", () => {
    const active = makeBoard();
    const { actions } = sanitizeAgentActions(
      [
        { type: "addBoard", title: "Mới", ref: "b1", columns: [] },
        { type: "addCard", columnId: COLUMN_ID, title: "Thẻ ở board cũ", patch: [] },
      ] as unknown as AppAction[],
      active,
      [active]
    );

    expect(actions.map((a) => a.type)).toEqual(["addBoard", "switchBoard", "addCard"]);
    expect(actions[1]).toEqual({ type: "switchBoard", boardId: BOARD_ID });
  });

  it("lets cards target a column created earlier in the same reply", () => {
    const active = makeBoard();
    const { actions, dropped } = sanitizeAgentActions(
      [
        { type: "addColumn", title: "Backlog", ref: "col-new" },
        { type: "addCard", columnId: "col-new", title: "Ý tưởng", patch: [] },
      ] as unknown as AppAction[],
      active,
      [active]
    );

    expect(dropped).toBe(0);
    const columnId = (actions[0] as Extract<AppAction, { type: "addColumn" }>).columnId;
    expect(columnId).toBeTruthy();
    expect((actions[1] as Extract<AppAction, { type: "addCard" }>).columnId).toBe(columnId);
  });

  it("still drops a card aimed at a ref nobody created", () => {
    const active = makeBoard();
    const { actions, dropped } = sanitizeAgentActions(
      [{ type: "addCard", columnId: "c-bia", title: "X", patch: [] }] as unknown as AppAction[],
      active,
      [active]
    );
    expect(actions).toEqual([]);
    expect(dropped).toBe(1);
  });

  it("does not count a pending cross-board deletion as having switched boards", () => {
    const active = makeBoard();
    const other = makeOtherBoard();
    const { actions } = sanitizeAgentActions(
      [
        { type: "removeColumn", columnId: OTHER_COLUMN_ID },
        { type: "renameColumn", columnId: COLUMN_ID, title: "Việc cần làm" },
      ],
      active,
      [active, other]
    );

    // switchBoard + removeColumn sẽ chờ xác nhận; renameColumn chạy ngay trên
    // board đang mở nên không được chen thêm switchBoard nào.
    expect(actions).toEqual([
      { type: "switchBoard", boardId: OTHER_BOARD_ID },
      { type: "removeColumn", columnId: OTHER_COLUMN_ID },
      { type: "renameColumn", columnId: COLUMN_ID, title: "Việc cần làm" },
    ]);
  });
});

describe("sanitizeAgentActions — field và cột", () => {
  it("clears a due date when asked explicitly", () => {
    const [action] = sanitize({
      type: "updateCard",
      columnId: COLUMN_ID,
      cardId: CARD_ID,
      patch: [{ field: "clear", value: "dueDate" }],
    });
    const patch = (action as Extract<AppAction, { type: "updateCard" }>).patch;
    expect("dueDate" in patch).toBe(true);
    expect(patch.dueDate).toBeUndefined();
  });

  it("refuses to clear a field that must always have a value", () => {
    const result = sanitize({
      type: "updateCard",
      columnId: COLUMN_ID,
      cardId: CARD_ID,
      patch: [
        { field: "clear", value: "title" },
        { field: "clear", value: "priority" },
      ],
    });
    expect(result).toEqual([]);
  });

  it("clamps a column move to the existing columns", () => {
    const board: Board = {
      ...makeBoard(),
      columns: [...makeBoard().columns, { id: "col-b", title: "Done", order: 1, cards: [] }],
    };
    const { actions } = sanitizeAgentActions(
      [{ type: "moveColumn", columnId: COLUMN_ID, toIndex: 7 }],
      board,
      [board]
    );
    expect(actions).toEqual([{ type: "moveColumn", columnId: COLUMN_ID, toIndex: 1 }]);
  });

  it("drops removing the only board, which the reducer would ignore", () => {
    expect(sanitize({ type: "removeBoard", boardId: BOARD_ID })).toEqual([]);
  });

  it("drops renames to an empty or placeholder title", () => {
    expect(sanitize({ type: "renameColumn", columnId: COLUMN_ID, title: "." })).toEqual([]);
    expect(sanitize({ type: "renameBoard", boardId: BOARD_ID, title: "  " })).toEqual([]);
  });

  it("applies the manual WIP rules: positive, rounded down", () => {
    expect(sanitize({ type: "setWipLimit", columnId: COLUMN_ID, wipLimit: -2 })).toEqual([]);
    expect(sanitize({ type: "setWipLimit", columnId: COLUMN_ID, wipLimit: 3.7 })).toEqual([
      { type: "setWipLimit", columnId: COLUMN_ID, wipLimit: 3 },
    ]);
  });
});
