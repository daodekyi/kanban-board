import { v4 as uuidv4 } from "uuid";
import type { AppAction } from "./appReducer";
import type { Board, Card, Priority, Subtask } from "../types";

type CardPatch = Partial<Omit<Card, "id">>;

/** One {field, value} entry as produced by the Worker's patch schema. */
interface PatchEntry {
  field: string;
  value: unknown;
}

/** Agent action shapes before validation — patches arrive as arrays, not objects. */
type RawAgentAction = Omit<Extract<AppAction, { type: "addCard" | "updateCard" }>, "patch"> & {
  patch?: unknown;
};

const PRIORITIES: Priority[] = ["low", "medium", "high"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A model asked to leave a field alone sometimes emits a filler string instead
 * of omitting the entry — "." wiped real card titles in production. Treat text
 * with no letters or digits as "the model had nothing to say here".
 */
function isPlaceholderText(value: string): boolean {
  return !/[\p{L}\p{N}]/u.test(value);
}

function normalizeSubtasks(value: unknown, existing: Subtask[] = []): Subtask[] {
  if (!Array.isArray(value)) return [];
  const existingIds = new Set(existing.map((s) => s.id));
  return value
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      // Only honor an id the card already has; anything else the model invented
      // gets a real UUID so agent-authored subtasks can't collide or dangle.
      id: typeof s.id === "string" && existingIds.has(s.id) ? s.id : uuidv4(),
      title: typeof s.title === "string" ? s.title.trim() : "",
      isDone: !!s.isDone,
    }))
    .filter((s) => s.title !== "");
}

/**
 * Convert the Worker's [{field, value}] patch list into a Card patch object,
 * dropping any entry whose value doesn't match what the field actually holds.
 * The list shape means an unchanged field is simply absent, so there's no
 * "unset" sentinel that could overwrite real data.
 */
function buildPatch(rawPatch: unknown, existingSubtasks: Subtask[] = []): CardPatch {
  if (!Array.isArray(rawPatch)) return {};
  const patch: CardPatch = {};

  for (const entry of rawPatch as PatchEntry[]) {
    if (!entry || typeof entry !== "object") continue;
    const { field, value } = entry;

    switch (field) {
      case "title":
      case "description":
      case "assignee": {
        if (typeof value !== "string") break;
        const trimmed = value.trim();
        if (trimmed === "" || isPlaceholderText(trimmed)) break;
        patch[field] = trimmed;
        break;
      }
      case "dueDate": {
        if (typeof value === "string" && DATE_PATTERN.test(value)) patch.dueDate = value;
        break;
      }
      case "priority": {
        if (PRIORITIES.includes(value as Priority)) patch.priority = value as Priority;
        break;
      }
      case "labels": {
        if (Array.isArray(value) && value.every((l) => typeof l === "string")) {
          patch.labels = value as string[];
        }
        break;
      }
      case "subtasks": {
        patch.subtasks = normalizeSubtasks(value, existingSubtasks);
        break;
      }
    }
  }

  return patch;
}

/**
 * Actions returned by the agent reference ids from a JSON snapshot the model
 * cannot be fully trusted to get right. Drop or repair anything that doesn't
 * match the board's actual current state before it ever reaches dispatch.
 */
export function sanitizeAgentAction(
  action: AppAction,
  board: Board,
  boards: Board[]
): AppAction | null {
  const findColumn = (id: string) => board.columns.find((c) => c.id === id);
  const findCard = (columnId: string, cardId: string) =>
    findColumn(columnId)?.cards.find((c) => c.id === cardId);

  switch (action.type) {
    case "addColumn":
      return action.title?.trim() ? action : null;

    case "removeColumn":
    case "renameColumn":
    case "setColumnDone":
      return findColumn(action.columnId) ? action : null;

    case "setWipLimit":
      return findColumn(action.columnId) ? action : null;

    case "addCard": {
      if (!findColumn(action.columnId) || !action.title?.trim()) return null;
      const patch = buildPatch((action as RawAgentAction).patch);
      return { ...action, patch };
    }

    case "updateCard": {
      const card = findCard(action.columnId, action.cardId);
      if (!card) return null;
      const patch = buildPatch((action as RawAgentAction).patch, card.subtasks);
      // An update that survived validation with nothing left to change would
      // dispatch a no-op and make the sync look like it did something.
      if (Object.keys(patch).length === 0) return null;
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

/**
 * Deletions are the only agent actions that destroy data the user can't get
 * back, so they're held for explicit confirmation instead of being dispatched
 * with everything else.
 */
export function isDestructiveAction(action: AppAction): boolean {
  return action.type === "removeCard" || action.type === "removeColumn" || action.type === "removeBoard";
}

/** Human-readable summary of what a deletion would remove, for the confirm prompt. */
export function describeDestructiveAction(action: AppAction, board: Board, boards: Board[]): string {
  switch (action.type) {
    case "removeCard": {
      const card = board.columns
        .find((c) => c.id === action.columnId)
        ?.cards.find((c) => c.id === action.cardId);
      return `Xóa thẻ "${card?.title ?? "?"}"`;
    }
    case "removeColumn": {
      const column = board.columns.find((c) => c.id === action.columnId);
      const count = column?.cards.length ?? 0;
      return count > 0
        ? `Xóa cột "${column?.title ?? "?"}" cùng ${count} thẻ bên trong`
        : `Xóa cột "${column?.title ?? "?"}"`;
    }
    case "removeBoard": {
      const target = boards.find((b) => b.id === action.boardId);
      const cardCount = target?.columns.reduce((sum, c) => sum + c.cards.length, 0) ?? 0;
      return `Xóa board "${target?.title ?? "?"}" cùng toàn bộ ${cardCount} thẻ bên trong`;
    }
    default:
      return "Thao tác không xác định";
  }
}

export function sanitizeAgentActions(actions: AppAction[], board: Board, boards: Board[]): AppAction[] {
  const result: AppAction[] = [];
  for (const raw of actions) {
    // clearWipLimit exists only in the agent's vocabulary — the reducer clears
    // a limit by setting it to undefined, which the agent schema can't express.
    const action =
      (raw as { type: string }).type === "clearWipLimit"
        ? ({
            type: "setWipLimit",
            columnId: (raw as unknown as { columnId: string }).columnId,
            wipLimit: undefined,
          } as AppAction)
        : raw;

    const sanitized = sanitizeAgentAction(action, board, boards);
    if (sanitized) result.push(sanitized);
  }
  return result;
}
