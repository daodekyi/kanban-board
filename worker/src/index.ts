import { Agent, run, setDefaultOpenAIKey } from "@openai/agents";
import { z } from "zod";

export interface Env {
  OPENAI_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

const SubtaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  isDone: z.boolean(),
});

// A patch is a LIST of {field, value} entries rather than one big object
// with every property nullable. This is deliberate: an object where every
// field must always be present (even if only to hold null) gives a small,
// fast model too much surface to get wrong — in testing, gpt-5.6-luna
// occasionally filled an "unchanged" field with a placeholder like "."
// instead of null, silently overwriting real data (e.g. wiping a card's
// title/dueDate when the user only asked to change its priority). A list
// has no such trap: the model simply omits an entry for anything it isn't
// changing, so there's no "unset" value to get wrong in the first place.
const PatchFieldSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("title"), value: z.string() }),
  z.object({ field: z.literal("description"), value: z.string() }),
  z.object({ field: z.literal("labels"), value: z.array(z.string()) }),
  z.object({ field: z.literal("dueDate"), value: z.string() }),
  z.object({ field: z.literal("priority"), value: z.enum(["low", "medium", "high"]) }),
  z.object({ field: z.literal("assignee"), value: z.string() }),
  z.object({ field: z.literal("subtasks"), value: z.array(SubtaskSchema) }),
]);

const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("addColumn"), title: z.string() }),
  z.object({ type: z.literal("removeColumn"), columnId: z.string() }),
  z.object({ type: z.literal("renameColumn"), columnId: z.string(), title: z.string() }),
  z.object({
    type: z.literal("addCard"),
    columnId: z.string(),
    title: z.string(),
    patch: z.array(PatchFieldSchema),
  }),
  z.object({
    type: z.literal("updateCard"),
    columnId: z.string(),
    cardId: z.string(),
    patch: z.array(PatchFieldSchema),
  }),
  z.object({ type: z.literal("removeCard"), columnId: z.string(), cardId: z.string() }),
  z.object({
    type: z.literal("moveCard"),
    cardId: z.string(),
    fromColumnId: z.string(),
    toColumnId: z.string(),
    toIndex: z.number(),
  }),
  z.object({ type: z.literal("setColumnDone"), columnId: z.string(), isDone: z.boolean() }),
  z.object({ type: z.literal("setWipLimit"), columnId: z.string(), wipLimit: z.number() }),
  z.object({ type: z.literal("clearWipLimit"), columnId: z.string() }),
  z.object({ type: z.literal("addBoard"), title: z.string() }),
  z.object({ type: z.literal("renameBoard"), boardId: z.string(), title: z.string() }),
  z.object({ type: z.literal("removeBoard"), boardId: z.string() }),
  z.object({ type: z.literal("switchBoard"), boardId: z.string() }),
]);

const AgentOutputSchema = z.object({
  reply: z.string(),
  actions: z.array(ActionSchema),
});

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function verifyUser(token: string, env: Env): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
    });
    return res.ok;
  } catch {
    return false;
  }
}

const INSTRUCTIONS = `Bạn là trợ lý quản lý Kanban board cho một ứng dụng thật. Người dùng sẽ cung cấp trạng thái board hiện tại dưới dạng JSON (có id thật của board/column/card) và một yêu cầu bằng ngôn ngữ tự nhiên.

Trả lời bằng "reply" (tiếng Việt, ngắn gọn) và "actions" (danh sách thao tác cần thực hiện, đúng schema đã cung cấp).

Quy tắc bắt buộc:
- CHỈ dùng id (columnId, cardId, boardId) có thật trong dữ liệu board được cung cấp. Tuyệt đối không bịa id.
- "patch" là MẢNG các mục {field, value}, CHỈ liệt kê những field thật sự cần thay đổi. Không cần thay field nào thì để mảng rỗng []. TUYỆT ĐỐI KHÔNG thêm mục cho field mà người dùng không yêu cầu đổi, và không bao giờ dùng giá trị giữ chỗ như "." hay "" — làm vậy sẽ ghi đè mất dữ liệu thật của người dùng.
- Khi thêm/sửa/xóa subtask của một card đã có sẵn subtasks, value của field "subtasks" phải là TOÀN BỘ danh sách subtask sau khi thay đổi (giữ nguyên id các subtask cũ không đổi, subtask mới có thể dùng id tạm bất kỳ vì hệ thống sẽ tự cấp lại id thật).
- "dueDate" phải đúng định dạng YYYY-MM-DD (ví dụ 2026-08-30). Nếu không xác định được ngày cụ thể từ yêu cầu, đừng thêm field dueDate vào patch.
- Nếu yêu cầu chỉ là câu hỏi hoặc cần tóm tắt/phân tích board (không cần thay đổi dữ liệu), trả lời đầy đủ trong "reply" và để "actions" là mảng rỗng.
- Nếu yêu cầu không đủ rõ ràng (ví dụ không rõ thêm thẻ vào cột nào, giao cho ai), hỏi lại trong "reply" một cách cụ thể và để "actions" rỗng — không được đoán bừa.
- Dựa vào lịch sử hội thoại phía trên để hiểu các yêu cầu nối tiếp: khi người dùng nói "task này", "thẻ vừa tạo", "nó"..., hãy hiểu là thẻ/cột được nhắc tới gần nhất trong hội thoại; chỉ hỏi lại khi thật sự không suy ra được.
- Không tự ý thực hiện hành động phá hủy dữ liệu lớn (xóa nhiều thẻ/cột/board cùng lúc) trừ khi người dùng nói rõ ràng.
- Với yêu cầu xóa: LUÔN LUÔN đưa action removeCard/removeColumn/removeBoard vào "actions" như bình thường. Ứng dụng sẽ tự hiện hộp thoại xác nhận và chỉ xóa khi người dùng bấm nút, nên bạn KHÔNG được giữ lại action để chờ người dùng trả lời trong chat — làm vậy thì sẽ không có gì xảy ra cả. Đồng thời "reply" không được nói là đã xóa xong (vì chưa xóa); chỉ cần một câu ngắn như "Mình đã chuẩn bị xóa cột X." là đủ.`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const authorized = await verifyUser(token, env);
    if (!authorized) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let body: {
      prompt?: string;
      board?: unknown;
      boards?: unknown;
      history?: { role?: string; text?: string }[];
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const prompt = (body.prompt ?? "").trim();
    if (!prompt) {
      return jsonResponse({ error: "Missing prompt" }, 400);
    }

    setDefaultOpenAIKey(env.OPENAI_API_KEY);

    const agent = new Agent({
      name: "Kanban Assistant",
      model: "gpt-5.6-luna",
      instructions: INSTRUCTIONS,
      outputType: AgentOutputSchema,
    });

    const contextJson = JSON.stringify({ activeBoard: body.board, boards: body.boards });

    const history = (body.history ?? [])
      .filter((m) => typeof m.text === "string" && m.text.trim() !== "")
      .map((m) => `${m.role === "user" ? "Người dùng" : "Trợ lý"}: ${m.text}`)
      .join("\n");
    const historyBlock = history ? `Lịch sử hội thoại trước đó:\n${history}\n\n` : "";

    try {
      const result = await run(
        agent,
        `Dữ liệu board hiện tại:\n${contextJson}\n\n${historyBlock}Yêu cầu người dùng: ${prompt}`
      );
      const output = result.finalOutput ?? { reply: "Xin lỗi, tôi chưa xử lý được yêu cầu này.", actions: [] };
      return jsonResponse(output);
    } catch (err) {
      console.error("Agent run failed", err);
      return jsonResponse({ error: "Agent request failed" }, 500);
    }
  },
};
