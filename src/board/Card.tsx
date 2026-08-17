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

const PRIORITY_BORDER: Record<Priority, string> = {
  low: "border-l-gray-300",
  medium: "border-l-amber-400",
  high: "border-l-red-400",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
};

const DUE_SOON_DAYS = 3;
const STUCK_WARNING_DAYS = 3;
const STUCK_DANGER_DAYS = 7;

function daysUntil(dueDate: string): number {
  const today = new Date(new Date().toDateString());
  const due = new Date(dueDate);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function daysSince(isoDate: string): number {
  const then = new Date(isoDate);
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

export function CardView({
  card,
  columnId,
  columnIsDone = false,
  hidden = false,
}: {
  card: Card;
  columnId: string;
  columnIsDone?: boolean;
  hidden?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: hidden ? "none" : undefined,
  };

  const dueDays = card.dueDate ? daysUntil(card.dueDate) : null;
  const stuckDays =
    !columnIsDone && card.enteredColumnAt ? daysSince(card.enteredColumnAt) : 0;
  const isStuck = stuckDays >= STUCK_WARNING_DAYS;

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={() => setOpen(true)}
        className={`bg-white rounded-md shadow-sm border border-gray-100 border-l-4 ${PRIORITY_BORDER[card.priority]} p-3 cursor-pointer hover:shadow-md transition-shadow space-y-2`}
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
          {dueDays !== null && (
            <span
              className={
                dueDays < 0
                  ? "px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium"
                  : dueDays <= DUE_SOON_DAYS
                    ? "px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 font-medium"
                    : "text-gray-400"
              }
            >
              {dueDays < 0
                ? `Quá hạn ${Math.abs(dueDays)} ngày`
                : dueDays === 0
                  ? "Hết hạn hôm nay"
                  : dueDays <= DUE_SOON_DAYS
                    ? `Còn ${dueDays} ngày`
                    : card.dueDate}
            </span>
          )}
          {isStuck && (
            <span
              className={
                stuckDays >= STUCK_DANGER_DAYS
                  ? "px-1.5 py-0.5 rounded bg-red-50 text-red-500 flex items-center gap-0.5"
                  : "px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex items-center gap-0.5"
              }
              title="Thời gian thẻ nằm ở cột này (cycle time)"
            >
              ⏱ {stuckDays} ngày
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
