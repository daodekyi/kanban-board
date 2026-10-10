import { Agent, OpenAIChatCompletionsModel, run, setDefaultOpenAIKey } from "@openai/agents";
import OpenAI from "openai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { bearerToken, verifyUser } from "./auth";

export interface Env {
  OPENAI_API_KEY: string;
  /** Các key dưới đây tùy chọn — chỉ cần cho model tương ứng trong panel chat. */
  GEMINI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

/** Khóa ngắn frontend gửi lên; id model thật chỉ nằm trong bảng MODELS. */
export type ProviderKey = "gpt" | "gemini" | "claude" | "deepseek";

type SecretName = "OPENAI_API_KEY" | "GEMINI_API_KEY" | "ANTHROPIC_API_KEY" | "OPENROUTER_API_KEY";

interface ModelConfig {
  /** Nhãn hiển thị — frontend lấy qua `GET /models` chứ không tự chế nhãn. */
  label: string;
  /** Id model thật gửi cho provider. */
  id: string;
  /**
   * Base URL của lớp tương thích OpenAI. `undefined` = OpenAI gốc, chạy qua
   * client mặc định của SDK (đường đã dùng từ đầu và đang ổn — cố ý không kéo
   * nó sang Chat Completions chỉ để cho "đồng bộ" với các provider khác).
   */
  baseURL?: string;
  /** Secret chứa API key. Thiếu secret ⇒ model hiện mờ, không chọn được. */
  secret: SecretName;
  /** Trần context của model, dùng cho thanh đo trong panel chat. */
  contextLimit: number;
  /**
   * Cách gửi request. Mặc định `"openai"` = lớp tương thích OpenAI dùng chung
   * cho mọi provider. `"anthropic"` = API gốc `/v1/messages` + tool use, chỉ
   * dùng khi lớp tương thích không nhận được schema này (xem ghi chú ở Claude).
   */
  transport?: "openai" | "anthropic";
}

/**
 * Bảng đăng ký model. Cả 4 provider đều nói được "phương ngữ" OpenAI Chat
 * Completions, nên dùng chung đúng một đường sinh structured output — không có
 * nơi thứ hai để các bài học về dạng `patch` (mảng, không phải object) phải học
 * lại từ đầu. Thêm model mới = thêm một dòng ở đây, không đụng logic bên dưới.
 */
const MODELS: Record<ProviderKey, ModelConfig> = {
  gpt: {
    label: "GPT-5.6 Luna",
    id: "gpt-5.6-luna",
    secret: "OPENAI_API_KEY",
    contextLimit: 1_050_000,
  },
  gemini: {
    label: "Gemini 3.5 Flash Lite",
    id: "gemini-3.5-flash-lite",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    secret: "GEMINI_API_KEY",
    contextLimit: 1_048_576,
  },
  // Claude KHÔNG đi qua lớp tương thích OpenAI mà gọi thẳng API gốc
  // `/v1/messages` (transport: "anthropic"). Lý do, đã thử và có log:
  //   1. `chat/completions` của Anthropic bắt buộc
  //      `response_format.json_schema.strict = true`;
  //   2. nhưng strict thì Anthropic biên dịch schema này thành grammar vượt
  //      trần → 400 "The compiled grammar is too large".
  // Hai điều kiện loại trừ nhau nên cửa đó bịt kín. API gốc ép định dạng bằng
  // tool use (schema là mô tả tham số, không biên dịch thành grammar) nên
  // không dính trần. Đổi lại output không được bảo đảm cứng ⇒ nhánh này BẮT
  // BUỘC validate lại bằng chính AgentOutputSchema.
  claude: {
    label: "Claude Sonnet 5",
    id: "claude-sonnet-5",
    transport: "anthropic",
    secret: "ANTHROPIC_API_KEY",
    contextLimit: 1_000_000,
  },
  deepseek: {
    label: "DeepSeek V4 Flash (OpenRouter)",
    id: "deepseek/deepseek-v4-flash",
    baseURL: "https://openrouter.ai/api/v1",
    secret: "OPENROUTER_API_KEY",
    contextLimit: 1_048_576,
  },
};

const PROVIDER_KEYS = Object.keys(MODELS) as ProviderKey[];

/** Giá trị lạ hoặc thiếu đều rơi về "gpt" — frontend bản cũ không gửi field này. */
export function resolveProvider(value: unknown): ProviderKey {
  return typeof value === "string" && (PROVIDER_KEYS as string[]).includes(value)
    ? (value as ProviderKey)
    : "gpt";
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

type AgentOutput = z.infer<typeof AgentOutputSchema>;

/**
 * Cùng một schema Zod ở trên, chuyển sang JSON Schema để gửi cho model không
 * bật strict. `$refStrategy: "none"` trải phẳng mọi tham chiếu — provider không
 * đảm bảo hiểu `$ref`, mà schema này chỉ dùng ở một chỗ nên trải phẳng vô hại.
 */
const AGENT_OUTPUT_JSON_SCHEMA = zodToJsonSchema(AgentOutputSchema, {
  $refStrategy: "none",
}) as Record<string, unknown>;

/** Tên "công cụ" Claude buộc phải gọi — xem `runViaAnthropic`. */
const TOOL_NAME = "emit_kanban_result";

/**
 * Gọi thẳng API gốc của Anthropic bằng tool use: model buộc phải gọi "công cụ"
 * `emit_kanban_result`, và tham số của công cụ chính là schema output của app.
 * Đây là cách ép định dạng KHÔNG qua grammar, nên không đụng trần kích thước.
 *
 * Trả về JSON thô — người gọi phải validate bằng AgentOutputSchema.
 */
/** Số token của một lượt, lấy từ chính provider chứ không ước lượng. */
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

async function runViaAnthropic(
  apiKey: string,
  modelId: string,
  userMessage: string
): Promise<{ output: unknown; usage: TokenUsage }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      // Bắt buộc với API gốc. Board lớn + nhiều action nên để rộng tay.
      max_tokens: 8000,
      system: INSTRUCTIONS,
      messages: [{ role: "user", content: userMessage }],
      tools: [
        {
          name: TOOL_NAME,
          description: "Trả về phản hồi cho người dùng kèm danh sách thao tác cần thực hiện.",
          input_schema: AGENT_OUTPUT_JSON_SCHEMA,
        },
      ],
      // Ép model phải dùng đúng công cụ này thay vì trả lời bằng văn xuôi.
      tool_choice: { type: "tool", name: TOOL_NAME },
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    content?: { type?: string; name?: string; input?: unknown }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const toolUse = data.content?.find((b) => b.type === "tool_use" && b.name === TOOL_NAME);
  if (!toolUse) {
    throw new Error("Anthropic không trả về tool_use như yêu cầu");
  }
  return {
    output: toolUse.input,
    usage: {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    },
  };
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const INSTRUCTIONS = `Bạn là trợ lý quản lý Kanban board cho một ứng dụng thật. Người dùng sẽ cung cấp trạng thái board hiện tại dưới dạng JSON (có id thật của board/column/card) và một yêu cầu bằng ngôn ngữ tự nhiên.

Trả lời bằng "reply" (tiếng Việt, ngắn gọn) và "actions" (danh sách thao tác cần thực hiện, đúng schema đã cung cấp).

Cách trình bày "reply": khi liệt kê từ 2 mục trở lên (danh sách thẻ, thống kê theo cột, các board...), hãy xuống dòng và dùng gạch đầu dòng "- " cho từng mục, mỗi mục một dòng. Dùng **in đậm** cho tên cột/thẻ/board để dễ quét mắt. Câu trả lời ngắn 1-2 ý thì viết thành câu bình thường, không cần gạch đầu dòng. Chỉ dùng đúng 2 loại định dạng này (gạch đầu dòng và in đậm), không dùng tiêu đề #, bảng, hay khối code.

Quy tắc bắt buộc:
- CHỈ dùng id (columnId, cardId, boardId) có thật trong dữ liệu board được cung cấp. Tuyệt đối không bịa id.
- "patch" là MẢNG các mục {field, value}, CHỈ liệt kê những field thật sự cần thay đổi. Không cần thay field nào thì để mảng rỗng []. TUYỆT ĐỐI KHÔNG thêm mục cho field mà người dùng không yêu cầu đổi, và không bao giờ dùng giá trị giữ chỗ như "." hay "" — làm vậy sẽ ghi đè mất dữ liệu thật của người dùng.
- Khi thêm/sửa/xóa subtask của một card đã có sẵn subtasks, value của field "subtasks" phải là TOÀN BỘ danh sách subtask sau khi thay đổi (giữ nguyên id các subtask cũ không đổi, subtask mới có thể dùng id tạm bất kỳ vì hệ thống sẽ tự cấp lại id thật).
- "dueDate" phải đúng định dạng YYYY-MM-DD (ví dụ 2026-08-30). Nếu không xác định được ngày cụ thể từ yêu cầu, đừng thêm field dueDate vào patch.
- Nếu yêu cầu chỉ là câu hỏi hoặc cần tóm tắt/phân tích board (không cần thay đổi dữ liệu), trả lời đầy đủ trong "reply" và để "actions" là mảng rỗng.
- Nếu yêu cầu không đủ rõ ràng (ví dụ không rõ thêm thẻ vào cột nào, giao cho ai), hỏi lại trong "reply" một cách cụ thể và để "actions" rỗng — không được đoán bừa.
- Dựa vào lịch sử hội thoại phía trên để hiểu các yêu cầu nối tiếp: khi người dùng nói "task này", "thẻ vừa tạo", "nó"..., hãy hiểu là thẻ/cột được nhắc tới gần nhất trong hội thoại; chỉ hỏi lại khi thật sự không suy ra được.
- Dữ liệu gửi lên gồm "activeBoard" (board đang mở) và "boards" (TẤT CẢ board của người dùng). Bạn thao tác được trên mọi board, không chỉ board đang mở.
- Khi người dùng muốn mở/chuyển sang một board khác ("mở board X", "chuyển sang board X"), hãy trả action {"type":"switchBoard","boardId":"<id thật của board X>"}. TUYỆT ĐỐI KHÔNG trả lời rằng bạn không làm được việc này, và không bảo người dùng tự bấm vào danh sách board — bạn có action để làm, hãy dùng nó.
- Khi thao tác trên thẻ/cột nằm ở board KHÁC board đang mở, đặt một action switchBoard tới board đó TRƯỚC các action còn lại.
- Không tự ý thực hiện hành động phá hủy dữ liệu lớn (xóa nhiều thẻ/cột/board cùng lúc) trừ khi người dùng nói rõ ràng.
- Với yêu cầu xóa: LUÔN LUÔN đưa action removeCard/removeColumn/removeBoard vào "actions" như bình thường. Ứng dụng sẽ tự hiện hộp thoại xác nhận và chỉ xóa khi người dùng bấm nút, nên bạn KHÔNG được giữ lại action để chờ người dùng trả lời trong chat — làm vậy thì sẽ không có gì xảy ra cả. Đồng thời "reply" không được nói là đã xóa xong (vì chưa xóa); chỉ cần một câu ngắn như "Mình đã chuẩn bị xóa cột X." là đủ.`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Danh sách model cho dropdown. Không yêu cầu đăng nhập vì ở đây chỉ có
    // nhãn + id model (không phải bí mật), và panel chat cần dựng dropdown
    // trước cả khi người dùng gửi yêu cầu đầu tiên. `available` cho frontend
    // biết model nào chưa có key để hiện mờ thay vì để chọn rồi mới báo lỗi.
    if (request.method === "GET" && new URL(request.url).pathname === "/models") {
      return jsonResponse({
        models: PROVIDER_KEYS.map((key) => ({
          key,
          label: MODELS[key].label,
          id: MODELS[key].id,
          contextLimit: MODELS[key].contextLimit,
          available: Boolean(env[MODELS[key].secret]),
        })),
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const userId = await verifyUser(bearerToken(request), env);
    if (!userId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let body: {
      prompt?: string;
      model?: string;
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

    const provider = resolveProvider(body.model);
    const config = MODELS[provider];
    const apiKey = env[config.secret];
    if (!apiKey) {
      return jsonResponse(
        {
          error: `Worker chưa có ${config.secret} nên chưa dùng được ${config.label}. Chạy \`npx wrangler secret put ${config.secret}\` rồi deploy lại.`,
        },
        400
      );
    }

    const contextJson = JSON.stringify({ activeBoard: body.board, boards: body.boards });

    // Frontend gửi cả phiên chat (không còn cắt cứng 10 lượt) để trợ lý nhớ
    // được hội thoại dài và để thanh đo context trong panel phản ánh đúng thực
    // tế. Chặn ở đây theo DUNG LƯỢNG, giữ các lượt mới nhất: một phiên rất dài
    // vẫn không được phép vượt trần context của model. Ước lượng thô ~4 ký tự
    // /token là đủ cho việc cắt bớt — con số hiển thị cho người dùng vẫn là số
    // thật do provider trả về, không phải ước lượng này.
    const budgetChars = Math.max(0, config.contextLimit * 4 - contextJson.length - 20_000);
    const lines: string[] = [];
    let used = 0;
    for (const m of (body.history ?? []).slice().reverse()) {
      if (typeof m.text !== "string" || m.text.trim() === "") continue;
      const line = `${m.role === "user" ? "Người dùng" : "Trợ lý"}: ${m.text}`;
      if (used + line.length > budgetChars) break;
      used += line.length;
      lines.unshift(line);
    }
    const historyBlock = lines.length
      ? `Lịch sử hội thoại trước đó:\n${lines.join("\n")}\n\n`
      : "";

    const userMessage = `Dữ liệu board hiện tại:\n${contextJson}\n\n${historyBlock}Yêu cầu người dùng: ${prompt}`;

    try {
      if (config.transport === "anthropic") {
        const { output: raw, usage } = await runViaAnthropic(apiKey, config.id, userMessage);
        // Tool use không ép cứng định dạng như structured output, nên phải soi
        // lại bằng chính Zod schema đó — đừng để dữ liệu chưa kiểm chứng đi
        // tiếp xuống frontend.
        const parsed = AgentOutputSchema.safeParse(raw);
        if (!parsed.success) {
          console.error(`Output sai schema (provider=${provider})`, parsed.error.message);
          return jsonResponse(
            {
              error: `Trợ lý (${config.label}) trả về dữ liệu không đúng định dạng. Bạn thử lại hoặc đổi model khác.`,
            },
            502
          );
        }
        return jsonResponse({
          ...(parsed.data satisfies AgentOutput),
          usage: { ...usage, contextLimit: config.contextLimit },
        });
      }

      // SDK vẫn cần key OpenAI mặc định kể cả khi chạy provider khác (nó đọc
      // key lúc dựng client mặc định), nên set trước khi chạy.
      setDefaultOpenAIKey(env.OPENAI_API_KEY);

      const agent = new Agent({
        name: "Kanban Assistant",
        model: config.baseURL
          ? new OpenAIChatCompletionsModel(new OpenAI({ apiKey, baseURL: config.baseURL }), config.id)
          : config.id,
        instructions: INSTRUCTIONS,
        outputType: AgentOutputSchema,
      });

      const result = await run(agent, userMessage);

      // SDK có thể gọi model nhiều lượt cho một yêu cầu, nên cộng dồn tất cả
      // — hiện một lượt lẻ sẽ báo thiếu so với thực tế bị tính tiền.
      const usage = result.rawResponses.reduce(
        (sum, r) => ({
          inputTokens: sum.inputTokens + (r.usage?.inputTokens ?? 0),
          outputTokens: sum.outputTokens + (r.usage?.outputTokens ?? 0),
        }),
        { inputTokens: 0, outputTokens: 0 }
      );

      return jsonResponse({
        ...(result.finalOutput ?? { reply: "Xin lỗi, tôi chưa xử lý được yêu cầu này.", actions: [] }),
        usage: { ...usage, contextLimit: config.contextLimit },
      });
    } catch (err) {
      // Ghi kèm provider vì 2 model hỏng theo kiểu rất khác nhau (Gemini có thể
      // từ chối schema mà OpenAI chấp nhận), và `wrangler tail` là nơi duy nhất
      // nhìn thấy được khác biệt đó.
      console.error(`Agent run failed (provider=${provider})`, err);
      return jsonResponse({ error: `Trợ lý (${provider}) gặp lỗi khi xử lý yêu cầu.` }, 500);
    }
  },
};
