import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useBoard } from "./BoardContext";
import { sanitizeAgentActions } from "./agentActions";
import type { AppAction } from "./appReducer";

interface ChatMessage {
  role: "user" | "agent" | "error";
  text: string;
}

const WORKER_URL = import.meta.env.VITE_AGENT_WORKER_URL as string | undefined;

export function AgentChat() {
  const { board, boards, dispatch } = useBoard();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const text = prompt.trim();
    if (!text || loading) return;

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
      actions.forEach((action) => dispatch(action));

      setMessages((prev) => [
        ...prev,
        { role: "agent", text: data.reply || "Đã thực hiện." },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "error", text: err instanceof Error ? err.message : "Có lỗi xảy ra." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 w-12 h-12 rounded-full bg-indigo-500 hover:bg-indigo-600 text-white text-xl shadow-lg flex items-center justify-center z-40"
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
                    ? "bg-indigo-500 text-white ml-auto"
                    : m.role === "error"
                      ? "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                }`}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div className="text-sm text-gray-400 dark:text-gray-500 px-3 py-2">Đang xử lý...</div>
            )}
          </div>

          <div className="p-3 border-t border-gray-100 dark:border-gray-800 flex gap-2">
            <input
              className="flex-1 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2.5 py-1.5 focus:outline-none focus:border-indigo-400"
              placeholder="Nhập yêu cầu..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={loading}
              className="px-3 py-1.5 text-sm rounded-md bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50"
            >
              Gửi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
