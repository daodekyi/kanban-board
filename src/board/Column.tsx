import { useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence } from "framer-motion";
import type { Column } from "../types";
import { CardView } from "./Card";
import { useBoard } from "./BoardContext";

function splitLeadingNumber(title: string): { number: string | null; rest: string } {
  const match = title.match(/^(\d+)\.\s*(.*)$/);
  if (!match) return { number: null, rest: title };
  return { number: match[1], rest: match[2] };
}

export function ColumnView({ column, searchQuery = "" }: { column: Column; searchQuery?: string }) {
  const { dispatch } = useBoard();
  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(column.title);

  const { setNodeRef } = useDroppable({ id: column.id });

  const overLimit = column.wipLimit != null && column.cards.length > column.wipLimit;
  const { number: titleNumber, rest: titleRest } = splitLeadingNumber(column.title);

  const query = searchQuery.trim().toLowerCase();
  const matchesSearch = (cardTitle: string, description?: string) =>
    query === "" ||
    cardTitle.toLowerCase().includes(query) ||
    (description ?? "").toLowerCase().includes(query);
  const matchCount = column.cards.filter((c) => matchesSearch(c.title, c.description)).length;

  const handleAddCard = () => {
    const title = newCardTitle.trim();
    if (title) {
      dispatch({ type: "addCard", columnId: column.id, title });
    }
    setNewCardTitle("");
    setAddingCard(false);
  };

  const handleRename = () => {
    const title = titleDraft.trim();
    if (title) {
      dispatch({ type: "renameColumn", columnId: column.id, title });
    }
    setEditingTitle(false);
  };

  const handleRemoveColumn = () => {
    if (column.cards.length > 0) {
      const confirmed = window.confirm(
        `Cột "${column.title}" có ${column.cards.length} thẻ. Xóa cột sẽ xóa luôn các thẻ này. Tiếp tục?`
      );
      if (!confirmed) return;
    }
    dispatch({ type: "removeColumn", columnId: column.id });
  };

  const handleToggleDone = () => {
    dispatch({ type: "setColumnDone", columnId: column.id, isDone: !column.isDone });
  };

  const handleSetWipLimit = () => {
    const input = window.prompt(
      "Giới hạn số thẻ tối đa cho cột này (để trống để bỏ giới hạn):",
      column.wipLimit != null ? String(column.wipLimit) : ""
    );
    if (input === null) return;
    const trimmed = input.trim();
    if (trimmed === "") {
      dispatch({ type: "setWipLimit", columnId: column.id, wipLimit: undefined });
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) {
      dispatch({ type: "setWipLimit", columnId: column.id, wipLimit: Math.floor(parsed) });
    }
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg w-72 flex-shrink-0 flex flex-col max-h-full">
      <div className="flex items-center justify-between p-3">
        {editingTitle ? (
          <input
            autoFocus
            className="flex-1 text-sm font-semibold bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded px-2 py-1 mr-2"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="flex items-center gap-1.5 min-w-0 cursor-text"
              onClick={() => setEditingTitle(true)}
            >
              {titleNumber && (
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-bold shrink-0">
                  {titleNumber}
                </span>
              )}
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                {titleRest}
              </span>
            </span>
            <button
              type="button"
              onClick={handleSetWipLimit}
              title="Đặt giới hạn số thẻ (WIP limit)"
              className={`text-xs font-normal shrink-0 ${overLimit ? "text-red-500 font-semibold" : "text-gray-400 dark:text-gray-500"}`}
            >
              ({query !== "" ? `${matchCount}/${column.cards.length}` : column.cards.length}
              {column.wipLimit != null ? `/${column.wipLimit} tối đa` : ""})
            </button>
          </div>
        )}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleToggleDone}
            title={column.isDone ? "Bỏ đánh dấu cột hoàn thành" : "Đánh dấu là cột hoàn thành"}
            className={`text-sm ${column.isDone ? "text-emerald-500" : "text-gray-300 dark:text-gray-600 hover:text-emerald-400"}`}
          >
            ✓
          </button>
          <button
            type="button"
            onClick={handleRemoveColumn}
            className="text-gray-400 dark:text-gray-500 hover:text-red-500 text-sm"
          >
            ✕
          </button>
        </div>
      </div>

      {overLimit && (
        <div className="mx-3 mb-2 px-2 py-1 text-xs rounded bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 font-medium">
          Vượt giới hạn WIP ({column.cards.length}/{column.wipLimit})
        </div>
      )}

      <div ref={setNodeRef} className="flex-1 overflow-y-auto px-3 space-y-2">
        <SortableContext
          items={column.cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <AnimatePresence initial={false}>
            {column.cards.map((card) => (
              <CardView
                key={card.id}
                card={card}
                columnId={column.id}
                columnIsDone={column.isDone}
                hidden={!matchesSearch(card.title, card.description)}
              />
            ))}
          </AnimatePresence>
        </SortableContext>
      </div>

      <div className="p-3">
        {addingCard ? (
          <div className="space-y-2">
            <input
              autoFocus
              className="w-full text-sm rounded px-2 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              placeholder="Tiêu đề thẻ..."
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCard()}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddCard}
                className="px-2 py-1 text-xs rounded bg-blue-500 text-white"
              >
                Thêm
              </button>
              <button
                type="button"
                onClick={() => setAddingCard(false)}
                className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              >
                Hủy
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingCard(true)}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            + Thêm thẻ
          </button>
        )}
      </div>
    </div>
  );
}
