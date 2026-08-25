import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import type { Card, Priority } from "../types";
import { CardModal } from "./CardModal";
import { avatarColorFor, initialsFor } from "./avatar";

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
  medium: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400",
  high: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400",
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

type CompletionStatus = { label: string; className: string };

function completionStatus(dueDate: string, completedAtIso: string): CompletionStatus {
  const due = new Date(new Date(dueDate).toDateString());
  const completed = new Date(new Date(completedAtIso).toDateString());
  const diffDays = Math.round((due.getTime() - completed.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return {
      label: `Sớm ${diffDays} ngày`,
      className:
        "px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 font-medium",
    };
  }
  if (diffDays === 0) {
    return {
      label: "Đúng hạn",
      className:
        "px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 font-medium",
    };
  }
  return {
    label: `Trễ ${Math.abs(diffDays)} ngày`,
    className: "px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 font-medium",
  };
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
  const completion =
    columnIsDone && card.dueDate && card.enteredColumnAt
      ? completionStatus(card.dueDate, card.enteredColumnAt)
      : null;
  const subtasks = card.subtasks ?? [];
  const doneSubtasks = subtasks.filter((s) => s.isDone).length;

  return (
    <>
      <motion.div
        layout="position"
        initial={{ opacity: 0, y: -8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9, height: 0, marginBottom: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          onClick={() => setOpen(true)}
          className={`bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-100 dark:border-gray-800 border-l-4 ${PRIORITY_BORDER[card.priority]} p-3 cursor-pointer hover:shadow-md hover:-translate-y-0.5 dark:hover:shadow-black/30 transition-all space-y-2`}
        >
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{card.title}</div>
          {card.assignee && (
            <span
              title={card.assignee}
              className="flex items-center justify-center w-6 h-6 rounded-full text-white text-[10px] font-semibold shrink-0"
              style={{ backgroundColor: avatarColorFor(card.assignee) }}
            >
              {initialsFor(card.assignee)}
            </span>
          )}
        </div>

        {subtasks.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                style={{ width: `${(doneSubtasks / subtasks.length) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
              {doneSubtasks}/{subtasks.length}
            </span>
          </div>
        )}

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
          {completion ? (
            <span className={completion.className} title="So với hạn chót lúc hoàn thành">
              ✔ {completion.label}
            </span>
          ) : (
            dueDays !== null && (
              <span
                className={
                  dueDays <= 0
                    ? "px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 font-medium animate-pulse-urgent"
                    : dueDays <= DUE_SOON_DAYS
                      ? "px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-medium"
                      : "text-gray-400 dark:text-gray-500"
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
            )
          )}
          {isStuck && (
            <span
              className={
                stuckDays >= STUCK_DANGER_DAYS
                  ? "px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400 flex items-center gap-0.5"
                  : "px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 flex items-center gap-0.5"
              }
              title="Thời gian thẻ nằm ở cột này (cycle time)"
            >
              ⏱ {stuckDays} ngày
            </span>
          )}
        </div>
        </div>
      </motion.div>

      {open && (
        <CardModal card={card} columnId={columnId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
