import { useState } from "react";
import type { Card, Priority } from "../types";
import { useBoard } from "./BoardContext";

const LABEL_COLORS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#60a5fa", "#a78bfa"];

export function CardModal({
  card,
  columnId,
  onClose,
}: {
  card: Card;
  columnId: string;
  onClose: () => void;
}) {
  const { dispatch } = useBoard();
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [labels, setLabels] = useState<string[]>(card.labels);
  const [dueDate, setDueDate] = useState(card.dueDate ?? "");
  const [priority, setPriority] = useState<Priority>(card.priority);

  const toggleLabel = (color: string) => {
    setLabels((prev) =>
      prev.includes(color) ? prev.filter((l) => l !== color) : [...prev, color]
    );
  };

  const handleSave = () => {
    dispatch({
      type: "updateCard",
      columnId,
      cardId: card.id,
      patch: {
        title,
        description: description || undefined,
        labels,
        dueDate: dueDate || undefined,
        priority,
      },
    });
    onClose();
  };

  const handleDelete = () => {
    const confirmed = window.confirm(`Xóa thẻ "${card.title}"? Hành động này không thể hoàn tác.`);
    if (!confirmed) return;
    dispatch({ type: "removeCard", columnId, cardId: card.id });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-5 space-y-4">
        <input
          className="w-full text-lg font-semibold border-b border-gray-200 pb-2 focus:outline-none focus:border-blue-400"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="w-full border border-gray-200 rounded p-2 text-sm min-h-[80px] focus:outline-none focus:border-blue-400"
          placeholder="Mô tả..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">Nhãn</div>
          <div className="flex gap-2">
            {LABEL_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => toggleLabel(color)}
                className="w-6 h-6 rounded-full border-2"
                style={{
                  backgroundColor: color,
                  borderColor: labels.includes(color) ? "#111827" : "transparent",
                }}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <div className="text-xs font-medium text-gray-500 mb-1">Hạn chót</div>
            <input
              type="date"
              className="w-full border border-gray-200 rounded p-2 text-sm"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <div className="text-xs font-medium text-gray-500 mb-1">Độ ưu tiên</div>
            <select
              className="w-full border border-gray-200 rounded p-2 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              <option value="low">Thấp</option>
              <option value="medium">Trung bình</option>
              <option value="high">Cao</option>
            </select>
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <button
            type="button"
            onClick={handleDelete}
            className="text-red-500 text-sm hover:underline"
          >
            Xóa thẻ
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border border-gray-200 hover:bg-gray-50"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1.5 text-sm rounded bg-blue-500 text-white hover:bg-blue-600"
            >
              Lưu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
