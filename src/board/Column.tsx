import { useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import type { Column } from "../types";
import { CardView } from "./Card";
import { useBoard } from "./BoardContext";

export function ColumnView({ column }: { column: Column }) {
  const { dispatch } = useBoard();
  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(column.title);

  const { setNodeRef } = useDroppable({ id: column.id });

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

  return (
    <div className="bg-gray-100 rounded-lg w-72 flex-shrink-0 flex flex-col max-h-full">
      <div className="flex items-center justify-between p-3">
        {editingTitle ? (
          <input
            autoFocus
            className="flex-1 text-sm font-semibold bg-white rounded px-2 py-1 mr-2"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
        ) : (
          <div
            className="text-sm font-semibold cursor-text"
            onClick={() => setEditingTitle(true)}
          >
            {column.title} <span className="text-gray-400 font-normal">({column.cards.length})</span>
          </div>
        )}
        <button
          type="button"
          onClick={handleRemoveColumn}
          className="text-gray-400 hover:text-red-500 text-sm"
        >
          ✕
        </button>
      </div>

      <div ref={setNodeRef} className="flex-1 overflow-y-auto px-3 space-y-2">
        <SortableContext
          items={column.cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.cards.map((card) => (
            <CardView key={card.id} card={card} columnId={column.id} />
          ))}
        </SortableContext>
      </div>

      <div className="p-3">
        {addingCard ? (
          <div className="space-y-2">
            <input
              autoFocus
              className="w-full text-sm rounded px-2 py-1.5 border border-gray-200"
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
                className="px-2 py-1 text-xs rounded border border-gray-200"
              >
                Hủy
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingCard(true)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            + Thêm thẻ
          </button>
        )}
      </div>
    </div>
  );
}
