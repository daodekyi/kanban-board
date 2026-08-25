import { v4 as uuidv4 } from "uuid";
import type { AppAction } from "./appReducer";
import type { Board, Subtask } from "../types";

/**
 * The Worker's structured-output schema requires every "unset" patch field to
 * be an explicit `null` (OpenAI Structured Outputs rejects bare `.optional()`
 * fields). Drop those nulls entirely rather than spreading them — reducers
 * merge patches with `{...card, ...patch}`, and an explicit `undefined` value
 * would still clobber the existing field instead of leaving it alone.
 */
function stripUnset<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

function normalizeSubtasks(subtasks: unknown, existing: Subtask[] = []): Subtask[] | undefined {
  if (!Array.isArray(subtasks)) return undefined;
  const existingIds = new Set(existing.map((s) => s.id));
  return subtasks
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      id: typeof s.id === "string" && existingIds.has(s.id) ? s.id : uuidv4(),
      title: typeof s.title === "string" ? s.title.trim() : "",
      isDone: !!s.isDone,
    }))
    .filter((s) => s.title !== "");
}

/**
 * Actions returned by the agent reference ids from a JSON snapshot the model
 * cannot be fully trusted to get right. Drop or repair anything that doesn't
 * match the board's actual current state before it ever reaches dispatch.
 */
export function sanitizeAgentAction(action: AppAction, board: Board, boards: Board[]): AppAction | null {
  const findColumn = (id: string) => board.columns.find((c) => c.id === id);
  const findCard = (columnId: string, cardId: string) => findColumn(columnId)?.cards.find((c) => c.id === cardId);

  switch (action.type) {
    case "addColumn":
      return action.title?.trim() ? action : null;

    case "removeColumn":
    case "renameColumn":
    case "setColumnDone":
      return findColumn(action.columnId) ? action : null;

    case "setWipLimit":
      return findColumn(action.columnId)
        ? { ...action, wipLimit: action.wipLimit ?? undefined }
        : null;

    case "addCard": {
      if (!findColumn(action.columnId) || !action.title?.trim()) return null;
      if (!action.patch) return { ...action, patch: undefined };
      const patch = stripUnset(action.patch);
      if (patch.subtasks !== undefined) patch.subtasks = normalizeSubtasks(patch.subtasks);
      return { ...action, patch };
    }

    case "updateCard": {
      const card = findCard(action.columnId, action.cardId);
      if (!card) return null;
      const patch = stripUnset(action.patch ?? {});
      if (patch.subtasks !== undefined) {
        patch.subtasks = normalizeSubtasks(patch.subtasks, card.subtasks);
      }
      return { ...action, patch };
    }

    case "removeCard":
      return findCard(action.columnId, action.cardId) ? action : null;

    case "moveCard": {
      const fromCol = findColumn(action.fromColumnId);
      const toCol = findColumn(action.toColumnId);
      const card = fromCol?.cards.find((c) => c.id === action.cardId);
      if (!fromCol || !toCol || !card) return null;
      const toIndex = Math.max(0, Math.min(action.toIndex, toCol.cards.length));
      return { ...action, toIndex };
    }

    case "addBoard":
      return action.title?.trim() ? action : null;

    case "renameBoard":
    case "removeBoard":
    case "switchBoard":
      return boards.some((b) => b.id === action.boardId) ? action : null;

    default:
      return null;
  }
}

export function sanitizeAgentActions(actions: AppAction[], board: Board, boards: Board[]): AppAction[] {
  return actions
    .map((a) => sanitizeAgentAction(a, board, boards))
    .filter((a): a is AppAction => a !== null);
}
