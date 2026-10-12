import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Card, Priority, Subtask } from "../types";
import { useBoard } from "./BoardContext";
import { avatarColorFor, initialsFor } from "./avatar";

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
  const [assignee, setAssignee] = useState(card.assignee ?? "");
  const [subtasks, setSubtasks] = useState<Subtask[]>(card.subtasks ?? []);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  const toggleLabel = (color: string) => {
    setLabels((prev) =>
      prev.includes(color) ? prev.filter((l) => l !== color) : [...prev, color]
    );
  };

  const addSubtask = () => {
    const t = newSubtaskTitle.trim();
    if (!t) return;
    setSubtasks((prev) => [...prev, { id: uuidv4(), title: t, isDone: false }]);
    setNewSubtaskTitle("");
  };

  const toggleSubtask = (id: string) => {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, isDone: !s.isDone } : s)));
  };

  const removeSubtask = (id: string) => {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  };

  const doneSubtasks = subtasks.filter((s) => s.isDone).length;

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
        assignee: assignee.trim() || undefined,
        subtasks,
      },
    });
    onClose();
  };

  const handleDelete = () => {
    const confirmed = window.confirm(`Xóa thẻ "${card.title}"? Lỡ tay vẫn khôi phục được bằng Ctrl+Z (⌘Z).`);
    if (!confirmed) return;
    dispatch({ type: "removeCard", columnId, cardId: card.id });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <input
          className="w-full text-lg font-semibold border-b border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 pb-2 focus:outline-none focus:border-indigo-400"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="w-full border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 rounded-md p-2.5 text-sm min-h-[80px] focus:outline-none focus:border-indigo-400"
          placeholder="Mô tả..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Người phụ trách</div>
          <div className="flex items-center gap-2">
            {assignee.trim() && (
              <span
                className="flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-semibold shrink-0"
                style={{ backgroundColor: avatarColorFor(assignee.trim()) }}
              >
                {initialsFor(assignee.trim())}
              </span>
            )}
            <input
              className="flex-1 border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 rounded-md p-2 text-sm focus:outline-none focus:border-indigo-400"
              placeholder="Tên người phụ trách..."
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            />
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Nhãn</div>
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
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Hạn chót</div>
            <input
              type="date"
              className="w-full border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 rounded-md p-2 text-sm"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Độ ưu tiên</div>
            <select
              className="w-full border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 rounded-md p-2 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              <option value="low">Thấp</option>
              <option value="medium">Trung bình</option>
              <option value="high">Cao</option>
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Việc con</div>
            {subtasks.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {doneSubtasks}/{subtasks.length}
                </span>
                <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                    style={{ width: `${subtasks.length ? (doneSubtasks / subtasks.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            {subtasks.map((s) => (
              <div key={s.id} className="flex items-center gap-2 group">
                <input
                  type="checkbox"
                  checked={s.isDone}
                  onChange={() => toggleSubtask(s.id)}
                  className="w-4 h-4 rounded accent-emerald-500 shrink-0"
                />
                <span
                  className={`flex-1 text-sm ${
                    s.isDone
                      ? "line-through text-gray-400 dark:text-gray-600"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {s.title}
                </span>
                <button
                  type="button"
                  onClick={() => removeSubtask(s.id)}
                  className="text-gray-300 dark:text-gray-600 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input
              className="flex-1 border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400"
              placeholder="Thêm việc con..."
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSubtask()}
            />
            <button
              type="button"
              onClick={addSubtask}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Thêm
            </button>
          </div>
        </div>

        <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={handleDelete}
            className="text-red-500 dark:text-red-400 text-sm hover:underline"
          >
            Xóa thẻ
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1.5 text-sm rounded-md bg-indigo-500 text-white hover:bg-indigo-600"
            >
              Lưu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
