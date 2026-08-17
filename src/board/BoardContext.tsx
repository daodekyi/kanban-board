import { createContext, useContext, useEffect, useReducer, type ReactNode } from "react";
import type { Board, BoardAction } from "../types";
import { boardReducer, createDefaultBoard } from "./boardReducer";
import { useLocalStorage } from "./useLocalStorage";

interface BoardContextValue {
  board: Board;
  dispatch: React.Dispatch<BoardAction>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useLocalStorage<Board>("kanban-board", createDefaultBoard());
  const [board, dispatch] = useReducer(boardReducer, stored);

  useEffect(() => {
    setStored(board);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  return (
    <BoardContext.Provider value={{ board, dispatch }}>
      {children}
    </BoardContext.Provider>
  );
}

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used within a BoardProvider");
  return ctx;
}
