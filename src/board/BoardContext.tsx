import { createContext, useContext, useEffect, useReducer, type ReactNode } from "react";
import type { Board } from "../types";
import { appReducer, createDefaultAppState, migrateToAppState, type AppAction } from "./appReducer";
import { useLocalStorage } from "./useLocalStorage";

interface BoardContextValue {
  board: Board;
  boards: Board[];
  dispatch: React.Dispatch<AppAction>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useLocalStorage<unknown>("kanban-board", null);
  const [state, dispatch] = useReducer(
    appReducer,
    stored,
    (initialStored) =>
      initialStored ? migrateToAppState(initialStored) : createDefaultAppState()
  );

  useEffect(() => {
    setStored(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const activeBoard =
    state.boards.find((b) => b.id === state.activeBoardId) ?? state.boards[0];

  return (
    <BoardContext.Provider value={{ board: activeBoard, boards: state.boards, dispatch }}>
      {children}
    </BoardContext.Provider>
  );
}

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used within a BoardProvider");
  return ctx;
}
