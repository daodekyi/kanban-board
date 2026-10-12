import { appReducer, type AppAction, type AppState } from "./appReducer";

/**
 * Lịch sử hoàn tác. Lưu nguyên snapshot AppState (reducer bất biến nên các
 * snapshot dùng chung phần không đổi, rẻ). Hoàn tác chỉ là đặt lại `present`;
 * BoardContext đồng bộ theo trạng thái chứ không theo action, nên khôi phục
 * cả thẻ/cột/board đã xóa cũng tự được ghi lại lên máy chủ.
 */
export interface HistoryState {
  past: AppState[];
  present: AppState;
  future: AppState[];
}

export type HistoryAction =
  /** Một bước hoàn tác = cả nhóm action (vd mọi thao tác trong một câu trả lời của trợ lý). */
  | { type: "apply"; actions: AppAction[] }
  | { type: "undo" }
  | { type: "redo" };

export const HISTORY_LIMIT = 50;

export function createHistory(present: AppState): HistoryState {
  return { past: [], present, future: [] };
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "apply": {
      const next = action.actions.reduce(appReducer, state.present);
      if (next === state.present) return state;
      // Tải dữ liệu từ máy chủ là điểm xuất phát mới, không phải thao tác của
      // người dùng — hoàn tác về trước đó sẽ là board mặc định rỗng.
      if (action.actions.some((a) => a.type === "hydrate")) return createHistory(next);
      // Chỉ chuyển board thì không đổi dữ liệu: không tạo bước hoàn tác, để
      // Ctrl+Z luôn gỡ một thay đổi thật thay vì "gỡ" một lần bấm chuyển board.
      if (action.actions.every((a) => a.type === "switchBoard")) return { ...state, present: next };
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
      };
    }

    case "undo": {
      if (state.past.length === 0) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
      };
    }

    case "redo": {
      if (state.future.length === 0) return state;
      return {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
      };
    }

    default:
      return state;
  }
}
