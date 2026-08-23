import type { Board, BoardAction } from "../types";
import { boardReducer, createDefaultBoard } from "./boardReducer";

export interface AppState {
  boards: Board[];
  activeBoardId: string;
}

export type BoardListAction =
  | { type: "addBoard"; title: string }
  | { type: "renameBoard"; boardId: string; title: string }
  | { type: "removeBoard"; boardId: string }
  | { type: "switchBoard"; boardId: string }
  | { type: "hydrate"; boards: Board[]; activeBoardId: string };

export type AppAction = BoardAction | BoardListAction;

const BOARD_LIST_ACTION_TYPES = new Set<BoardListAction["type"]>([
  "addBoard",
  "renameBoard",
  "removeBoard",
  "switchBoard",
  "hydrate",
]);

function isBoardListAction(action: AppAction): action is BoardListAction {
  return BOARD_LIST_ACTION_TYPES.has(action.type as BoardListAction["type"]);
}

export function createDefaultAppState(): AppState {
  const board = createDefaultBoard();
  return { boards: [board], activeBoardId: board.id };
}

function isAppStateShape(value: unknown): value is AppState {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as AppState).boards) &&
    typeof (value as AppState).activeBoardId === "string"
  );
}

function isLegacyBoardShape(value: unknown): value is Board {
  return !!value && typeof value === "object" && Array.isArray((value as Board).columns);
}

export function migrateToAppState(raw: unknown): AppState {
  if (isAppStateShape(raw)) return raw;
  if (isLegacyBoardShape(raw)) {
    return { boards: [raw], activeBoardId: raw.id };
  }
  return createDefaultAppState();
}

export function appReducer(state: AppState, action: AppAction): AppState {
  if (isBoardListAction(action)) {
    switch (action.type) {
      case "addBoard": {
        const board = createDefaultBoard(action.title);
        return {
          boards: [...state.boards, board],
          activeBoardId: board.id,
        };
      }

      case "renameBoard": {
        return {
          ...state,
          boards: state.boards.map((b) =>
            b.id === action.boardId ? { ...b, title: action.title } : b
          ),
        };
      }

      case "removeBoard": {
        if (state.boards.length <= 1) return state;
        const boards = state.boards.filter((b) => b.id !== action.boardId);
        const activeBoardId =
          state.activeBoardId === action.boardId ? boards[0].id : state.activeBoardId;
        return { boards, activeBoardId };
      }

      case "switchBoard": {
        if (!state.boards.some((b) => b.id === action.boardId)) return state;
        return { ...state, activeBoardId: action.boardId };
      }

      case "hydrate": {
        return { boards: action.boards, activeBoardId: action.activeBoardId };
      }

      default:
        return state;
    }
  }

  return {
    ...state,
    boards: state.boards.map((b) =>
      b.id === state.activeBoardId ? boardReducer(b, action) : b
    ),
  };
}
