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

const CardPatchSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    labels: z.array(z.string()).optional(),
    dueDate: z.string().optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    assignee: z.string().optional(),
    subtasks: z.array(SubtaskSchema).optional(),
  })
  .partial();

const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("addColumn"), title: z.string() }),
  z.object({ type: z.literal("removeColumn"), columnId: z.string() }),
  z.object({ type: z.literal("renameColumn"), columnId: z.string(), title: z.string() }),
  z.object({
    type: z.literal("addCard"),
    columnId: z.string(),
    title: z.string(),
    patch: CardPatchSchema.optional(),
  }),
  z.object({
    type: z.literal("updateCard"),
    columnId: z.string(),
    cardId: z.string(),
    patch: CardPatchSchema,
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
  z.object({ type: z.literal("setWipLimit"), columnId: z.string(), wipLimit: z.number().optional() }),
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
- Khi thêm/sửa/xóa subtask của một card đã có sẵn subtasks, "patch.subtasks" phải là TOÀN BỘ danh sách subtask sau khi thay đổi (giữ nguyên id các subtask cũ không đổi, subtask mới có thể dùng id tạm bất kỳ vì hệ thống sẽ tự cấp lại id thật).
- Nếu yêu cầu chỉ là câu hỏi hoặc cần tóm tắt/phân tích board (không cần thay đổi dữ liệu), trả lời đầy đủ trong "reply" và để "actions" là mảng rỗng.
- Nếu yêu cầu không đủ rõ ràng (ví dụ không rõ thêm thẻ vào cột nào, giao cho ai), hỏi lại trong "reply" một cách cụ thể và để "actions" rỗng — không được đoán bừa.
- Không tự ý thực hiện hành động phá hủy dữ liệu lớn (xóa nhiều thẻ/cột/board cùng lúc) trừ khi người dùng nói rõ ràng.`;

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

    let body: { prompt?: string; board?: unknown; boards?: unknown };
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

    try {
      const result = await run(
        agent,
        `Dữ liệu board hiện tại:\n${contextJson}\n\nYêu cầu người dùng: ${prompt}`
      );
      const output = result.finalOutput ?? { reply: "Xin lỗi, tôi chưa xử lý được yêu cầu này.", actions: [] };
      return jsonResponse(output);
    } catch (err) {
      console.error("Agent run failed", err);
      return jsonResponse({ error: "Agent request failed" }, 500);
    }
  },
};
