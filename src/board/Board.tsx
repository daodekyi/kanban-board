import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useBoard } from "./BoardContext";
import { ColumnView } from "./Column";
import { AgentChat } from "./AgentChat";

export function Board() {
  const { board, dispatch } = useBoard();
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const assignees = Array.from(
    new Set(
      board.columns.flatMap((c) => c.cards.map((card) => card.assignee).filter((a): a is string => !!a))
    )
  ).sort((a, b) => a.localeCompare(b));

  useEffect(() => {
    setAssigneeFilter(null);
    setSearchQuery("");
  }, [board.id]);

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
        <div className="px-6 pt-2 pb-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium">Tiến độ tổng thể</span>
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              {doneCards}/{totalCards} thẻ · {percentDone}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden max-w-md">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-300 via-amber-300 to-yellow-300 transition-all duration-300"
              style={{ width: `${percentDone}%` }}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative max-w-xs flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm pointer-events-none">
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm thẻ theo tiêu đề hoặc mô tả..."
                className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 pl-8 pr-8 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/40"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {assignees.length > 0 && (
              <select
                value={assigneeFilter ?? ""}
                onChange={(e) => setAssigneeFilter(e.target.value || null)}
                className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/40"
              >
                <option value="">Tất cả người phụ trách</option>
                {assignees.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

      <div className="flex gap-4 px-6 pb-6 overflow-x-auto flex-1">
        {board.columns
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((column, index, sorted) => (
            <ColumnView
              key={column.id}
              column={column}
              index={index}
              columnCount={sorted.length}
              searchQuery={searchQuery}
              assigneeFilter={assigneeFilter}
            />
          ))}

        <div className="w-72 flex-shrink-0">
          {addingColumn ? (
            <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200/70 dark:border-gray-800 rounded-xl p-3 space-y-2">
              <input
                autoFocus
                className="w-full text-sm rounded-md px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-400"
                placeholder="Tên cột..."
                value={newColumnTitle}
                onChange={(e) => setNewColumnTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddColumn}
                  className="px-2.5 py-1 text-xs rounded-md bg-indigo-500 text-white hover:bg-indigo-600"
                >
                  Thêm
                </button>
                <button
                  type="button"
                  onClick={() => setAddingColumn(false)}
                  className="px-2.5 py-1 text-xs rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                >
                  Hủy
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingColumn(true)}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 border border-dashed border-gray-300 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 rounded-xl px-3 py-2.5 w-full text-left transition-colors"
            >
              + Thêm cột
            </button>
          )}
        </div>
      </div>
      </div>
      <AgentChat />
    </DndContext>
  );
}
