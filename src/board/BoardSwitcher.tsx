import { useEffect, useRef, useState } from "react";
import { useBoard } from "./BoardContext";

export function BoardSwitcher() {
  const { board, boards, dispatch } = useBoard();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSwitch = (boardId: string) => {
    dispatch({ type: "switchBoard", boardId });
    setOpen(false);
  };

  const handleRename = (boardId: string, currentTitle: string) => {
    const title = window.prompt("Đổi tên board:", currentTitle);
    if (title && title.trim()) {
      dispatch({ type: "renameBoard", boardId, title: title.trim() });
    }
  };

  const handleRemove = (boardId: string, title: string) => {
    if (boards.length <= 1) return;
    const confirmed = window.confirm(
      `Xóa board "${title}"? Toàn bộ cột và thẻ trong board này sẽ mất.`
    );
    if (!confirmed) return;
    dispatch({ type: "removeBoard", boardId });
  };

  const handleAddBoard = () => {
    const title = window.prompt("Tên board mới:");
    if (title && title.trim()) {
      dispatch({ type: "addBoard", title: title.trim() });
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        {board.title}
        <span className="text-xs text-gray-400">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-56 rounded-lg shadow-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 z-50 py-1">
          {boards.map((b) => (
            <div
              key={b.id}
              className={`flex items-center justify-between px-3 py-1.5 text-sm ${
                b.id === board.id
                  ? "bg-gray-100 dark:bg-gray-800 font-medium"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
              }`}
            >
              <button
                type="button"
                onClick={() => handleSwitch(b.id)}
                className="flex-1 text-left truncate text-gray-800 dark:text-gray-100"
              >
                {b.title}
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleRename(b.id, b.title)}
                  title="Đổi tên board"
                  className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs"
                >
                  ✎
                </button>
                {boards.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemove(b.id, b.title)}
                    title="Xóa board"
                    className="text-gray-400 hover:text-red-500 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
            <button
              type="button"
              onClick={handleAddBoard}
              className="w-full text-left px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/60"
            >
              + Board mới
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
