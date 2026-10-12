import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import type { Board } from "../types";
import { appReducer, createDefaultAppState, migrateToAppState, type AppAction, type AppState } from "./appReducer";
import { createDefaultBoard } from "./boardReducer";
import { EMPTY_SNAPSHOT, flattenBoards } from "./boardRows";
import { createSyncQueue } from "./syncQueue";
import { loadInitialBoards } from "./loadInitialBoards";
import { createDataApi } from "../lib/dataApi";
import { loadSupabaseBoards } from "../lib/legacySupabase";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";

interface BoardContextValue {
  board: Board;
  boards: Board[];
  dispatch: React.Dispatch<AppAction>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

// Dữ liệu board nằm trên Cloudflare D1, đọc/ghi qua Worker (cùng Worker với
// trợ lý AI). Đăng nhập vẫn là Supabase Auth — token của nó là thứ Worker dùng
// để biết dữ liệu thuộc về ai.
const dataApi = createDataApi(import.meta.env.VITE_AGENT_WORKER_URL as string | undefined, async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});

function readLegacyLocalStorageBoards(): Board[] | null {
  const raw = window.localStorage.getItem("kanban-board");
  if (!raw) return null;
  try {
    const state: AppState = migrateToAppState(JSON.parse(raw));
    return state.boards.length > 0 ? state.boards : null;
  } catch {
    return null;
  }
}

export function BoardProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Chỉ phụ thuộc vào id: onAuthStateChange phát ra object user mới mỗi lần refresh token,
  // nếu phụ thuộc vào object thì mỗi lần như vậy sẽ tải lại và làm mất thay đổi chưa lưu.
  const userId = user?.id;
  const [state, dispatch] = useReducer(appReducer, null, createDefaultAppState);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const hydratingRef = useRef(true);
  // useState(() => ...) để hàng đợi chỉ tạo đúng 1 lần cho cả vòng đời provider.
  const [queue] = useState(() => createSyncQueue((p) => dataApi.sync(p), setSyncError));

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setReady(false);
    setLoadError(null);
    hydratingRef.current = true;

    (async () => {
      try {
        const { boards, snapshot } = await loadInitialBoards({
          loadD1: () => dataApi.load(),
          loadSupabase: () => loadSupabaseBoards(userId),
          loadLocal: readLegacyLocalStorageBoards,
          makeDefault: createDefaultBoard,
        });
        if (cancelled) return;
        queue.reset(snapshot);
        dispatch({ type: "hydrate", boards, activeBoardId: boards[0].id });
        hydratingRef.current = false;
        setReady(true);
      } catch (err) {
        console.error("Failed to load boards", err);
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, queue]);

  // Khi unmount (đăng xuất, đổi tài khoản) hủy các lần đẩy dữ liệu đang chạy dở của hàng đợi cũ.
  // StrictMode (dev) chạy mount→cleanup→mount: reset sớm vô hại vì effect tải gọi
  // queue.reset(snapshot) SAU await, nên snapshot thật luôn được đặt sau cùng.
  useEffect(() => () => queue.reset(EMPTY_SNAPSHOT), [queue]);

  // Còn thay đổi chưa lưu lên server (đang gửi dở hoặc đang lỗi) thì đóng tab / F5 sẽ mất
  // dữ liệu trong bộ nhớ — bật hộp thoại "Rời khỏi trang?" chuẩn của trình duyệt.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!queue.hasPendingChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [queue]);

  useEffect(() => {
    if (!userId || !ready || hydratingRef.current) return;
    void queue.update(flattenBoards(state.boards));
  }, [state, userId, ready, queue]);

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-gray-600 dark:text-gray-300">
        <p>Không tải được dữ liệu board.</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{loadError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5"
        >
          Tải lại trang
        </button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
        Đang tải dữ liệu...
      </div>
    );
  }

  const activeBoard = state.boards.find((b) => b.id === state.activeBoardId) ?? state.boards[0];

  return (
    <BoardContext.Provider value={{ board: activeBoard, boards: state.boards, dispatch }}>
      {syncError !== null && (
        // Màu trung tính có chủ ý: đỏ/cam/tím/xanh lá đã dành cho cảnh báo trên thẻ (xem CLAUDE.md).
        <div
          role="alert"
          className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-md bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 text-sm px-3 py-1.5 shadow"
        >
          <span>⚠ Chưa lưu được thay đổi lên máy chủ.</span>
          <span className="text-xs opacity-70">{syncError}</span>
          <button type="button" onClick={() => void queue.retry()} className="underline font-medium">
            Thử lại
          </button>
        </div>
      )}
      {children}
    </BoardContext.Provider>
  );
}

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used within a BoardProvider");
  return ctx;
}
