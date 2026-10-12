import { v4 as uuidv4 } from "uuid";
import { appReducer, type AppAction, type AppState } from "./appReducer";
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
/** Field xóa được giá trị qua mục `{field: "clear", value: <tên field>}`. */
const CLEARABLE_FIELDS = ["description", "dueDate", "assignee"] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A model asked to leave a field alone sometimes emits a filler string instead
 * of omitting the entry — "." wiped real card titles in production. Treat text
 * with no letters or digits as "the model had nothing to say here".
 */
function isPlaceholderText(value: string): boolean {
  return !/[\p{L}\p{N}]/u.test(value);
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !isPlaceholderText(value.trim());
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
      // Xóa giá trị là một mục riêng, nêu đích danh field cần xóa — không
      // dùng chuỗi rỗng, vì chuỗi rỗng/"." chính là giá trị giữ chỗ từng xóa
      // nhầm dữ liệu thật và vẫn bị loại ở trên.
      case "clear": {
        if ((CLEARABLE_FIELDS as readonly string[]).includes(value as string)) {
          patch[value as (typeof CLEARABLE_FIELDS)[number]] = undefined;
        }
        break;
      }
    }
  }

  return patch;
}

/** The board a column-scoped action targets, which needn't be the active one. */
function boardOwningColumn(columnId: string, boards: Board[]): Board | undefined {
  return boards.find((b) => b.columns.some((c) => c.id === columnId));
}

/** The board an action applies to, or undefined for ones that target whatever board is open. */
export function targetBoardOf(action: AppAction, boards: Board[]): Board | undefined {
  switch (action.type) {
    case "removeColumn":
    case "renameColumn":
    case "moveColumn":
    case "setColumnDone":
    case "setWipLimit":
    case "addCard":
    case "updateCard":
    case "removeCard":
      return boardOwningColumn(action.columnId, boards);
    case "moveCard":
      return boardOwningColumn(action.fromColumnId, boards);
    default:
      return undefined;
  }
}

/**
 * Actions returned by the agent reference ids from a JSON snapshot the model
 * cannot be fully trusted to get right. Drop or repair anything that doesn't
 * match the board's actual current state before it ever reaches dispatch.
 *
 * `board` is the board this action is checked against — for a request naming
 * another board ("xóa cột In Progress của Project B") that is the board that
 * owns the column, not the one currently on screen.
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
      return hasText(action.title) ? { ...action, title: action.title.trim() } : null;

    case "removeColumn":
    case "setColumnDone":
      return findColumn(action.columnId) ? action : null;

    case "renameColumn":
      return findColumn(action.columnId) && hasText(action.title)
        ? { ...action, title: action.title.trim() }
        : null;

    case "moveColumn": {
      if (!findColumn(action.columnId) || typeof action.toIndex !== "number") return null;
      const toIndex = Math.max(0, Math.min(Math.floor(action.toIndex), board.columns.length - 1));
      return { ...action, toIndex };
    }

    case "setWipLimit": {
      if (!findColumn(action.columnId)) return null;
      if (action.wipLimit === undefined) return action;
      // Cùng luật với ô nhập tay ở Column.tsx: số dương, làm tròn xuống.
      if (!Number.isFinite(action.wipLimit) || action.wipLimit < 1) return null;
      return { ...action, wipLimit: Math.floor(action.wipLimit) };
    }

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

    case "addBoard": {
      if (!hasText(action.title)) return null;
      const columns = (action.columns ?? []).filter((c) => hasText(c.title));
      return {
        ...action,
        title: action.title.trim(),
        columns: columns.map((c) => ({ ...c, title: c.title.trim() })),
      };
    }

    case "renameBoard":
      return boards.some((b) => b.id === action.boardId) && hasText(action.title)
        ? { ...action, title: action.title.trim() }
        : null;

    case "removeBoard":
      // Reducer không cho xóa board cuối cùng; để lọt qua thì chat sẽ báo
      // "đã xóa" trong khi thật ra không có gì xảy ra.
      return boards.length > 1 && boards.some((b) => b.id === action.boardId) ? action : null;

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
  // A deletion can target a board other than the one on screen, so look the
  // names up wherever the column actually lives.
  const owner = targetBoardOf(action, boards) ?? board;
  const onOther = owner.id !== board.id ? ` (board "${owner.title}")` : "";

  switch (action.type) {
    case "removeCard": {
      const card = owner.columns
        .find((c) => c.id === action.columnId)
        ?.cards.find((c) => c.id === action.cardId);
      return `Xóa thẻ "${card?.title ?? "?"}"${onOther}`;
    }
    case "removeColumn": {
      const column = owner.columns.find((c) => c.id === action.columnId);
      const count = column?.cards.length ?? 0;
      return count > 0
        ? `Xóa cột "${column?.title ?? "?"}" cùng ${count} thẻ bên trong${onOther}`
        : `Xóa cột "${column?.title ?? "?"}"${onOther}`;
    }
    case "removeBoard": {
      const target = boards.find((b) => b.id === action.boardId);
      const cardCount = target?.columns.reduce((sum, c) => sum + c.cards.length, 0) ?? 0;
      return cardCount > 0
        ? `Xóa board "${target?.title ?? "?"}" cùng toàn bộ ${cardCount} thẻ bên trong`
        : `Xóa board "${target?.title ?? "?"}"`;
    }
    default:
      return "Thao tác không xác định";
  }
}

export interface SanitizedActions {
  actions: AppAction[];
  /** How many the agent proposed that didn't survive validation, so the UI can say so instead of failing silently. */
  dropped: number;
}

/** Các field chứa id mà trợ lý có thể điền bằng `ref` tạm của board/cột vừa tạo. */
const ID_FIELDS = ["boardId", "columnId", "fromColumnId", "toColumnId"] as const;

/**
 * Chuyển một action thô của trợ lý về đúng dạng reducer hiểu:
 * - `clearWipLimit` (chỉ có trong từ vựng của trợ lý) → `setWipLimit` undefined;
 * - board/cột mới được cấp sẵn UUID thật, và `ref` tạm của chúng được ghi vào
 *   `refs` để các action phía sau trong cùng lượt trỏ tới được;
 * - mọi field id đang chứa một `ref` đã biết được thay bằng UUID thật.
 */
function normalizeAgentAction(raw: AppAction, refs: Map<string, string>): AppAction {
  const r = raw as unknown as Record<string, unknown>;
  let action: Record<string, unknown> =
    r.type === "clearWipLimit"
      ? { type: "setWipLimit", columnId: r.columnId, wipLimit: undefined }
      : { ...r };

  const resolve = (value: unknown) => (typeof value === "string" ? (refs.get(value) ?? value) : value);
  for (const field of ID_FIELDS) {
    if (field in action) action[field] = resolve(action[field]);
  }

  const register = (ref: unknown): string => {
    const id = uuidv4();
    if (typeof ref === "string" && ref.trim() !== "") refs.set(ref, id);
    return id;
  };

  if (action.type === "addColumn") {
    const { ref, ...rest } = action;
    action = { ...rest, columnId: register(ref) };
  } else if (action.type === "addBoard") {
    const { ref, columns, ...rest } = action;
    action = {
      ...rest,
      boardId: register(ref),
      columns: (Array.isArray(columns) ? columns : [])
        .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
        .map((c) => ({
          id: register(c.ref),
          title: typeof c.title === "string" ? c.title : "",
          isDone: !!c.isDone,
        })),
    };
  }

  return action as unknown as AppAction;
}

export function sanitizeAgentActions(
  actions: AppAction[],
  board: Board,
  boards: Board[]
): SanitizedActions {
  const result: AppAction[] = [];
  let dropped = 0;
  const refs = new Map<string, string>();
  // Bản nháp chạy qua chính appReducer, để action sau được kiểm tra trên board
  // ĐÃ chịu ảnh hưởng của action trước (cột/board vừa tạo, board đang mở sau
  // khi addBoard tự chuyển sang board mới...). Trước đây chỉ theo dõi id board
  // đang mở bằng tay nên bỏ sót addBoard, và thẻ thêm sau đó rơi vào board mới
  // rồi biến mất không báo.
  let draft: AppState = { boards, activeBoardId: board.id };

  for (const raw of actions) {
    const action = normalizeAgentAction(raw, refs);
    const owner = targetBoardOf(action, draft.boards);
    const active = draft.boards.find((b) => b.id === draft.activeBoardId) ?? board;
    const context = owner ?? active;

    const sanitized = sanitizeAgentAction(action, context, draft.boards);
    if (!sanitized) {
      dropped++;
      continue;
    }

    const needsSwitch = owner !== undefined && owner.id !== draft.activeBoardId;
    if (needsSwitch) result.push({ type: "switchBoard", boardId: owner.id });
    result.push(sanitized);

    // Thao tác xóa chờ người dùng xác nhận (cùng lệnh switchBoard dẫn tới nó —
    // xem AgentChat), nên chưa được phản ánh vào bản nháp: các action chạy
    // ngay phía sau phải thấy đúng trạng thái sẽ có khi chúng chạy.
    if (isDestructiveAction(sanitized)) continue;
    if (needsSwitch) draft = appReducer(draft, { type: "switchBoard", boardId: owner.id });
    draft = appReducer(draft, sanitized);
  }

  return { actions: result, dropped };
}
