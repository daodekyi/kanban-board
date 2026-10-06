import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useBoard } from "./BoardContext";
import {
  describeDestructiveAction,
  isDestructiveAction,
  sanitizeAgentActions,
} from "./agentActions";
import type { AppAction } from "./appReducer";
import { useLocalStorage } from "./useLocalStorage";
import { parseChatText } from "./chatText";

interface ChatMessage {
  /** "system" is the app speaking for itself, not the agent — used for prompts the agent must not be mistaken for. */
  role: "user" | "agent" | "system" | "error";
  text: string;
}

/** Khóa ngắn gửi lên Worker; id model thật do Worker quyết định. */
type ModelKey = "gpt" | "gemini" | "claude" | "deepseek";

interface ModelOption {
  key: ModelKey;
  label: string;
  id: string;
  /** false = Worker chưa có API key cho model này. */
  available: boolean;
  /** Trần context của model, do Worker khai báo. */
  contextLimit?: number;
}

/** Số token của lượt gần nhất — Worker lấy từ provider, không phải ước lượng. */
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  contextLimit: number;
}

const nf = new Intl.NumberFormat("vi-VN");

/**
 * Dùng khi chưa gọi được `GET /models` (Worker bản cũ, mất mạng). Chỉ có nhãn
 * chung chung, không có id — id model là việc của Worker, đoán ở đây thì sớm
 * muộn cũng lệch với thực tế.
 */
const FALLBACK_MODELS: ModelOption[] = [
  { key: "gpt", label: "GPT", id: "", available: true },
  { key: "gemini", label: "Gemini", id: "", available: true },
];

const WORKER_URL = import.meta.env.VITE_AGENT_WORKER_URL as string | undefined;

function modelsUrl(): string | undefined {
  if (!WORKER_URL) return undefined;
  try {
    return new URL("/models", WORKER_URL).toString();
  } catch {
    return undefined;
  }
}

export function AgentChat() {
  const { board, boards, dispatch } = useBoard();
  const [model, setModel] = useLocalStorage<ModelKey>("kanban.agentModel", "gpt");
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingDeletions, setPendingDeletions] = useState<AppAction[]>([]);
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_MODELS);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const selected = models.find((m) => m.key === model);

  // Danh sách model (nhãn + id thật + model nào đã có key) chỉ Worker mới biết.
  // Nạp một lần khi mở panel; hỏng thì giữ nguyên danh sách dự phòng.
  useEffect(() => {
    if (!open) return;
    const url = modelsUrl();
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { models?: ModelOption[] }) => {
        if (!cancelled && Array.isArray(data.models) && data.models.length > 0) {
          setModels(data.models);
        }
      })
      .catch(() => {
        /* giữ FALLBACK_MODELS — panel vẫn dùng được */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Popup phải đóng khi bấm ra ngoài, nếu không nó che mất khung chat.
  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerOpen]);

  // New messages and the confirmation panel are appended at the bottom, so
  // without this they land below the fold and look like nothing happened.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pendingDeletions, loading, open]);

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

      // Gửi cả phiên (Worker tự cắt bớt lượt cũ khi sắp chạm trần context) để
      // trợ lý nhớ được hội thoại dài. Bong bóng lỗi là trạng thái UI cục bộ,
      // không phải thứ agent cần suy luận, nên vẫn loại ra.
      const history = messages
        .filter((m) => m.role !== "error")
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: text, board, boards, history, model }),
      });

      // Đọc body cả khi lỗi: Worker trả lý do cụ thể (vd chưa cấu hình key cho
      // model đang chọn) — hiện mã trạng thái trần thì người dùng không biết
      // phải sửa gì.
      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        actions?: AppAction[];
        error?: string;
        usage?: TokenUsage;
      };
      if (!res.ok) {
        throw new Error(data.error || `Trợ lý phản hồi lỗi (${res.status})`);
      }
      if (data.error) throw new Error(data.error);
      if (data.usage) setUsage(data.usage);

      const { actions, dropped } = sanitizeAgentActions(data.actions ?? [], board, boards);

      // Deletions wait for confirmation, everything else runs now — except a
      // board switch sitting right before a deletion, which exists only to
      // reach that target. Running it early would yank the user to another
      // board before they've agreed to anything.
      const applied: AppAction[] = [];
      const deletions: AppAction[] = [];
      for (const action of actions) {
        if (isDestructiveAction(action)) {
          const prev = applied[applied.length - 1];
          if (prev?.type === "switchBoard") deletions.push(applied.pop()!);
          deletions.push(action);
        } else {
          applied.push(action);
        }
      }
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
                  .filter(isDestructiveAction)
                  .map((a) => describeDestructiveAction(a, board, boards).replace(/^Xóa /, ""))
                  .join(", ")}.`,
              },
            ]
          : []),
        // Without this, an action rejected during validation just vanishes and
        // the agent's "đã xong" reply is the only thing left on screen.
        ...(dropped > 0
          ? [
              {
                role: "error" as const,
                text: `Có ${dropped} thao tác không thực hiện được (không tìm thấy thẻ/cột/board tương ứng). Bạn thử nói rõ tên thẻ hoặc board giúp mình.`,
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
    const { actions: stillValid } = sanitizeAgentActions(pendingDeletions, board, boards);
    stillValid.forEach((action) => dispatch(action));
    // stillValid can carry board switches needed to reach the target, so count
    // only the deletions themselves.
    const deletedCount = stillValid.filter(isDestructiveAction).length;
    setPendingDeletions([]);
    setMessages((prev) => [
      ...prev,
      {
        role: "agent",
        text: deletedCount > 0 ? `Đã xóa (${deletedCount} mục).` : "Không còn mục nào để xóa.",
      },
    ]);
  };

  // Dọn = bỏ hẳn lịch sử phiên, không phải chỉ ẩn đi: chính lịch sử này được
  // gửi kèm mỗi lượt, nên xóa nó là thứ duy nhất thật sự giải phóng context.
  const handleClearContext = () => {
    setMessages([]);
    setPendingDeletions([]);
    setUsage(null);
  };

  const handleChangeModel = (option: ModelOption) => {
    setPickerOpen(false);
    if (option.key === model || !option.available) return;
    setModel(option.key);
    // Ghi mốc vào chính cuộc hội thoại: các câu trả lời phía dưới dòng này là
    // do model mới trả lời, nếu không thì khi so sánh 2 model sẽ không biết
    // câu nào của bên nào.
    setMessages((prev) => [
      ...prev,
      { role: "system", text: `Đã chuyển sang ${option.label}.` },
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
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Trợ lý Kanban
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm"
              >
                ✕
              </button>
            </div>

            <div ref={pickerRef} className="relative flex items-center gap-2">
              <span className="text-[10px] font-semibold tracking-widest text-gray-400 dark:text-gray-500">
                MODEL
              </span>
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={pickerOpen}
                onClick={() => setPickerOpen((o) => !o)}
                // Khóa lúc đang chờ: đổi model giữa chừng thì câu trả lời sắp
                // tới vẫn của model cũ, nhìn vào picker lại tưởng của model mới.
                disabled={loading || pendingDeletions.length > 0}
                className="flex-1 flex items-center justify-between gap-2 text-xs rounded-lg border border-orange-400 dark:border-orange-400 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 px-2.5 py-1.5 hover:border-orange-500 focus:outline-none focus:border-orange-500 disabled:opacity-50"
              >
                <span className="truncate">{selected?.label ?? model}</span>
                {/* Ký tự ▾ trước đây quá nhỏ, người dùng không nhận ra đây là
                    dropdown — dùng icon vẽ tay, to rõ, và xoay khi mở. */}
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={`w-4 h-4 shrink-0 text-orange-500 transition-transform ${
                    pickerOpen ? "rotate-180" : ""
                  }`}
                >
                  <path d="M5 7.5 10 12.5 15 7.5" />
                </svg>
              </button>

              {pickerOpen && (
                <ul
                  role="listbox"
                  className="absolute top-full left-0 right-0 mt-1 py-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl z-10 max-h-60 overflow-y-auto"
                >
                  {models.map((option) => {
                    const isSelected = option.key === model;
                    return (
                      <li key={option.key}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          disabled={!option.available}
                          onClick={() => handleChangeModel(option)}
                          className={`w-full text-left px-3 py-1.5 flex items-start gap-2 text-xs ${
                            option.available
                              ? "text-gray-700 dark:text-gray-200 hover:bg-orange-50 dark:hover:bg-gray-700"
                              : "text-gray-400 dark:text-gray-500 cursor-not-allowed"
                          }`}
                        >
                          <span className="w-3 shrink-0 text-orange-500">
                            {isSelected ? "✓" : ""}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate">{option.label}</span>
                            {/* Id thật để biết chính xác model nào đang chạy —
                                nhãn hiển thị thì đẹp nhưng mơ hồ khi so sánh. */}
                            {option.id && (
                              <span className="block truncate font-mono text-[10px] text-gray-400 dark:text-gray-500">
                                {option.id}
                              </span>
                            )}
                            {!option.available && (
                              <span className="block text-[10px] text-gray-400 dark:text-gray-500">
                                chưa cấu hình key
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Thanh đo context. Chỉ hiện sau lượt đầu tiên vì trước đó chưa có
                số thật nào — hiện 0% ngay từ đầu sẽ là con số bịa. */}
            {(() => {
              const limit = usage?.contextLimit ?? selected?.contextLimit;
              if (!limit) return null;
              const used = usage?.inputTokens ?? 0;
              const pct = Math.min(100, (used / limit) * 100);
              const barColor =
                pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-orange-500" : "bg-orange-400";
              return (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    Context: {nf.format(used)} / {nf.format(limit)} token ({pct.toFixed(1)}%)
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div
                      className={`h-full ${barColor} transition-all`}
                      style={{ width: `${Math.max(pct, 1)}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleClearContext}
                    disabled={loading || messages.length === 0}
                    title="Xóa lịch sử hội thoại để giải phóng context"
                    className="text-[11px] px-2 py-0.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 shrink-0"
                  >
                    Dọn
                  </button>
                </div>
              );
            })()}
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`text-sm rounded-lg px-3 py-2 max-w-[85%] break-words ${
                  m.role === "user"
                    ? "bg-orange-400 text-white ml-auto"
                    : m.role === "error"
                      ? "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400"
                      : m.role === "system"
                        ? "bg-transparent text-gray-500 dark:text-gray-400 italic px-0 max-w-full"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                }`}
              >
                {/* Chỉ tin nhắn của trợ lý mới cần dựng định dạng; câu người
                    dùng gõ thì hiện đúng nguyên văn, kể cả khi có dấu **. */}
                {m.role === "agent" ? (
                  <div className="space-y-0.5">
                    {parseChatText(m.text).map((line, li) => (
                      <div key={li} className={line.kind === "bullet" ? "flex gap-1.5" : ""}>
                        {line.kind === "bullet" && (
                          <span className="text-orange-400 shrink-0 leading-5">•</span>
                        )}
                        <span className="min-w-0">
                          {line.segments.map((seg, si) =>
                            seg.bold ? (
                              <strong key={si} className="font-semibold">
                                {seg.text}
                              </strong>
                            ) : (
                              <span key={si}>{seg.text}</span>
                            )
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  m.text
                )}
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
                  {pendingDeletions.filter(isDestructiveAction).map((action, i) => (
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
              className="flex-1 text-sm rounded-lg border border-orange-400 dark:border-orange-400 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2.5 py-1.5 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/40 disabled:border-gray-200 dark:disabled:border-gray-700 resize-none leading-5"
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
