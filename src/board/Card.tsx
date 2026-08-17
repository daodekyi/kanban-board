import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card, Priority } from "../types";
import { CardModal } from "./CardModal";

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
};

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

export function CardView({ card, columnId }: { card: Card; columnId: string }) {
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={() => setOpen(true)}
        className="bg-white rounded-md shadow-sm border border-gray-100 p-3 cursor-pointer hover:shadow-md transition-shadow space-y-2"
      >
        <div className="text-sm font-medium text-gray-800">{card.title}</div>

        {card.labels.length > 0 && (
          <div className="flex gap-1">
            {card.labels.map((color) => (
              <span
                key={color}
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-xs">
          <span className={`px-1.5 py-0.5 rounded ${PRIORITY_STYLES[card.priority]}`}>
            {PRIORITY_LABEL[card.priority]}
          </span>
          {card.dueDate && (
            <span className={isOverdue(card.dueDate) ? "text-red-500 font-medium" : "text-gray-400"}>
              {card.dueDate}
            </span>
          )}
        </div>
      </div>

      {open && (
        <CardModal card={card} columnId={columnId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
