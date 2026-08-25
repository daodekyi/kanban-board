import { useLayoutEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useBoard } from "./BoardContext";
import {
  describeDestructiveAction,
  isDestructiveAction,
  sanitizeAgentActions,
} from "./agentActions";
import type { AppAction } from "./appReducer";

interface ChatMessage {
  /** "system" is the app speaking for itself, not the agent — used for prompts the agent must not be mistaken for. */
  role: "user" | "agent" | "system" | "error";
  text: string;
}

const WORKER_URL = import.meta.env.VITE_AGENT_WORKER_URL as string | undefined;

export function AgentChat() {
  const { board, boards, dispatch } = useBoard();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingDeletions, setPendingDeletions] = useState<AppAction[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Grow the box with the text, up to a few lines, then let it scroll — the
  // panel is short, so an unbounded box would swallow the conversation.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const needed = el.scrollHeight;
    el.style.height = `${Math.min(needed, 120)}px`;
    // Only let it scroll once it has actually hit the cap — otherwise the
    // browser draws scrollbar arrows over a box that fits its content.
    el.style.overflowY = needed > 120 ? "auto" : "hidden";
  }, [prompt, open]);

  const handleSend = async () => {
    const text = prompt.trim();
    // A pending deletion must be resolved by the buttons; letting a message
    // through here is how a typed "yes" turned into a fresh request that
    // then couldn't find the already-deleted card.
    if (!text || loading || pendingDeletions.length > 0) return;

    if (!WORKER_URL) {
      setMessages((prev) => [
        ...prev,
        { role: "user", text },
        { role: "error", text: "Chưa cấu hình VITE_AGENT_WORKER_URL — trợ lý chưa sẵn sàng." },
      ]);
      setPrompt("");
      return;
    }

    setMessages((prev) => [...prev, { role: "user", text }]);
    setPrompt("");
    setLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Chưa đăng nhập");

      // Error bubbles are local UI state, not part of the conversation the
      // agent should reason about; the tail is enough for follow-ups like
      // "đổi ưu tiên task đó" without resending the whole transcript.
      const history = messages
        .filter((m) => m.role !== "error")
        .slice(-10)
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: text, board, boards, history }),
      });

      if (!res.ok) {
        throw new Error(`Trợ lý phản hồi lỗi (${res.status})`);
      }

      const data = (await res.json()) as { reply?: string; actions?: AppAction[]; error?: string };
      if (data.error) throw new Error(data.error);

      const actions = sanitizeAgentActions(data.actions ?? [], board, boards);
      const deletions = actions.filter(isDestructiveAction);
      const applied = actions.filter((a) => !isDestructiveAction(a));
      applied.forEach((action) => dispatch(action));

      // When the turn is nothing but deletions, the agent's reply only restates
      // what the confirmation panel already spells out — and phrases it as a
      // question, which invites a typed answer the composer won't accept. The
      // panel speaks for itself, so drop the reply in that case.
      const replyIsRedundant = deletions.length > 0 && applied.length === 0;

      setMessages((prev) => [
        ...prev,
        ...(replyIsRedundant
          ? []
          : [{ role: "agent" as const, text: data.reply || "Đã thực hiện." }]),
        ...(deletions.length > 0
          ? [
              {
                role: "system" as const,
                text: `Đang chờ bạn bấm nút xác nhận để xóa ${deletions
                  .map((a) => describeDestructiveAction(a, board, boards).replace(/^Xóa /, ""))
                  .join(", ")}.`,
              },
            ]
          : []),
      ]);
      if (deletions.length > 0) setPendingDeletions(deletions);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "error", text: err instanceof Error ? err.message : "Có lỗi xảy ra." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeletions = () => {
    // The non-destructive actions from the same reply already went through, so
    // re-validate against the board as it stands now rather than as it looked
    // when the agent proposed these.
    const stillValid = sanitizeAgentActions(pendingDeletions, board, boards);
    stillValid.forEach((action) => dispatch(action));
    setPendingDeletions([]);
    setMessages((prev) => [
      ...prev,
      {
        role: "agent",
        text:
          stillValid.length > 0
            ? `Đã xóa (${stillValid.length} mục).`
            : "Không còn mục nào để xóa.",
      },
    ]);
  };

  const handleCancelDeletions = () => {
    setPendingDeletions([]);
    setMessages((prev) => [...prev, { role: "agent", text: "Đã hủy, không xóa gì cả." }]);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`fixed bottom-5 right-5 w-14 h-14 rounded-full bg-orange-400 hover:bg-orange-500 text-white text-2xl shadow-lg flex items-center justify-center z-40 transition-colors ${
          open ? "" : "animate-pulse-halo"
        }`}
        title="Trợ lý Kanban"
      >
        🤖
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 w-96 max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[70vh] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl flex flex-col z-40">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Trợ lý Kanban</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`text-sm rounded-lg px-3 py-2 max-w-[85%] ${
                  m.role === "user"
                    ? "bg-orange-400 text-white ml-auto"
                    : m.role === "error"
                      ? "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400"
                      : m.role === "system"
                        ? "bg-transparent text-gray-500 dark:text-gray-400 italic px-0 max-w-full"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                }`}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div className="text-sm text-gray-400 dark:text-gray-500 px-3 py-2">Đang xử lý...</div>
            )}

            {pendingDeletions.length > 0 && (
              <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/60 px-3 py-2.5 space-y-2">
                <div className="text-sm font-semibold text-red-700 dark:text-red-300">
                  Xác nhận xóa
                </div>
                <ul className="text-sm text-red-700 dark:text-red-300 list-disc pl-4 space-y-0.5">
                  {pendingDeletions.map((action, i) => (
                    <li key={i}>{describeDestructiveAction(action, board, boards)}</li>
                  ))}
                </ul>
                <p className="text-xs text-red-600/80 dark:text-red-400/80">
                  Hành động này không thể hoàn tác.
                </p>
                <div className="flex gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={handleConfirmDeletions}
                    className="px-3 py-1 text-xs rounded-md bg-red-500 text-white hover:bg-red-600"
                  >
                    Xóa
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelDeletions}
                    className="px-3 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-gray-100 dark:border-gray-800 flex gap-2 items-end">
            <textarea
              ref={inputRef}
              rows={1}
              className="flex-1 text-sm rounded-lg border border-orange-400 dark:border-orange-500/70 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2.5 py-1.5 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/40 disabled:border-gray-200 dark:disabled:border-gray-700 resize-none leading-5"
              placeholder={
                pendingDeletions.length > 0
                  ? "Bấm Xóa hoặc Hủy ở trên để tiếp tục..."
                  : "Nhập yêu cầu..."
              }
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter starts a new line.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={loading || pendingDeletions.length > 0}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || pendingDeletions.length > 0}
              className="px-3 py-1.5 text-sm rounded-md bg-orange-400 text-white hover:bg-orange-500 disabled:opacity-50 shrink-0"
            >
              Gửi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
