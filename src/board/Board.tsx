import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useBoard } from "./BoardContext";
import { ColumnView } from "./Column";

export function Board() {
  const { board, dispatch } = useBoard();
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleAddColumn = () => {
    const title = newColumnTitle.trim();
    if (title) {
      dispatch({ type: "addColumn", title });
    }
    setNewColumnTitle("");
    setAddingColumn(false);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const cardId = String(active.id);
    const fromColumn = board.columns.find((c) => c.cards.some((card) => card.id === cardId));
    if (!fromColumn) return;

    const overId = String(over.id);
    let toColumn = board.columns.find((c) => c.id === overId);
    let toIndex: number;

    if (toColumn) {
      toIndex = toColumn.cards.length;
    } else {
      toColumn = board.columns.find((c) => c.cards.some((card) => card.id === overId));
      if (!toColumn) return;
      toIndex = toColumn.cards.findIndex((card) => card.id === overId);
    }

    if (fromColumn.id === toColumn.id) {
      const currentIndex = fromColumn.cards.findIndex((card) => card.id === cardId);
      if (currentIndex === toIndex) return;
    }

    dispatch({
      type: "moveCard",
      cardId,
      fromColumnId: fromColumn.id,
      toColumnId: toColumn.id,
      toIndex,
    });
  };

  const totalCards = board.columns.reduce((sum, c) => sum + c.cards.length, 0);
  const doneCards = board.columns
    .filter((c) => c.isDone)
    .reduce((sum, c) => sum + c.cards.length, 0);
  const percentDone = totalCards === 0 ? 0 : Math.round((doneCards / totalCards) * 100);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-screen">
        <div className="px-6 pt-1 pb-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Tiến độ tổng thể</span>
            <span className="font-medium">
              {doneCards}/{totalCards} thẻ ({percentDone}%)
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-200 overflow-hidden max-w-md">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-300"
              style={{ width: `${percentDone}%` }}
            />
          </div>
          <div className="relative max-w-xs">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Tìm thẻ theo tiêu đề hoặc mô tả..."
              className="w-full text-sm rounded-md border border-gray-200 px-3 py-1.5 focus:outline-none focus:border-indigo-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

      <div className="flex gap-4 px-6 pb-6 overflow-x-auto flex-1">
        {board.columns
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((column) => (
            <ColumnView key={column.id} column={column} searchQuery={searchQuery} />
          ))}

        <div className="w-72 flex-shrink-0">
          {addingColumn ? (
            <div className="bg-gray-100 rounded-lg p-3 space-y-2">
              <input
                autoFocus
                className="w-full text-sm rounded px-2 py-1.5 border border-gray-200"
                placeholder="Tên cột..."
                value={newColumnTitle}
                onChange={(e) => setNewColumnTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddColumn}
                  className="px-2 py-1 text-xs rounded bg-blue-500 text-white"
                >
                  Thêm
                </button>
                <button
                  type="button"
                  onClick={() => setAddingColumn(false)}
                  className="px-2 py-1 text-xs rounded border border-gray-200"
                >
                  Hủy
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingColumn(true)}
              className="text-sm text-gray-500 hover:text-gray-700 bg-gray-100/50 rounded-lg px-3 py-2 w-full text-left"
            >
              + Thêm cột
            </button>
          )}
        </div>
      </div>
      </div>
    </DndContext>
  );
}
