/**
 * Giọng nói → chữ cho panel trợ lý. Chỉ CHUYỂN ÂM THANH THÀNH CHỮ; chữ đó sau
 * đó đi đúng đường của tin nhắn gõ tay (validate, xác nhận xóa, hoàn tác) —
 * không có đường thứ hai nào để giọng nói tự thao tác lên board.
 *
 * Model `gpt-transcribe`: model OpenAI khuyên dùng cho file ghi âm (07/2026),
 * nhận `languages` và `keywords`. Lệnh Kanban ngắn, ghi xong mới gửi, nên không
 * cần bản realtime `gpt-live-transcribe` (đắt gần 4 lần, phải mở WebSocket).
 */
export const TRANSCRIBE_MODEL = "gpt-transcribe";

/** OpenAI nhận tới 25 MB; một lệnh nói 60 giây dạng webm/opus chỉ vài trăm KB. */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const MAX_KEYWORDS = 100;
const MAX_KEYWORD_LENGTH = 60;

/** Người dùng nói tiếng Việt, hay lẫn tên cột tiếng Anh ("To Do", "Review"). */
const LANGUAGES = ["vi", "en"];

const PROMPT =
  "Lệnh điều khiển một bảng Kanban bằng tiếng Việt, có thể lẫn từ tiếng Anh như To Do, In Progress, Review, Done, board, task.";

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

/**
 * Tên board/cột/thẻ/người phụ trách giúp model viết đúng chính tả ("Minh Anh"
 * chứ không phải "minh an"). OpenAI cấm `<`, `>` và xuống dòng trong keyword;
 * danh sách tới từ trình duyệt nên lọc lại ở đây, không tin nguyên văn.
 */
export function cleanKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const k = item.replace(/[<>\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_KEYWORD_LENGTH);
    if (!/[\p{L}\p{N}]/u.test(k) || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

export type TranscribeResult = { ok: true; text: string } | { ok: false; status: number; error: string };

export async function transcribe(apiKey: string, audio: Blob, keywords: string[]): Promise<TranscribeResult> {
  if (audio.size === 0) return { ok: false, status: 400, error: "Không nhận được âm thanh nào." };
  if (audio.size > MAX_AUDIO_BYTES) {
    return { ok: false, status: 413, error: "Đoạn ghi âm quá dài. Bạn nói ngắn gọn hơn (dưới 1 phút) nhé." };
  }

  const mime = (audio.type || "audio/webm").split(";")[0].trim();
  const form = new FormData();
  form.append("model", TRANSCRIBE_MODEL);
  form.append("file", audio, `command.${AUDIO_EXTENSIONS[mime] ?? "webm"}`);
  form.append("prompt", PROMPT);
  for (const lang of LANGUAGES) form.append("languages[]", lang);
  for (const k of keywords) form.append("keywords[]", k);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    console.error(`Transcribe failed ${res.status}`, (await res.text()).slice(0, 500));
    return { ok: false, status: 502, error: "Không nhận dạng được giọng nói lúc này. Bạn thử lại hoặc gõ phím nhé." };
  }

  const data = (await res.json()) as { text?: unknown };
  const text = typeof data.text === "string" ? data.text.trim() : "";
  if (!text) return { ok: false, status: 422, error: "Mình không nghe rõ. Bạn nói lại gần micro hơn nhé." };
  return { ok: true, text };
}
