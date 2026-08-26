# Kanban

Ứng dụng Kanban board chạy trên trình duyệt. Vite + React 18 + TypeScript + Tailwind CSS v4, kéo thả bằng dnd-kit, animation bằng framer-motion. Backend: Supabase (Postgres + Auth với Google login). Có thêm 1 Cloudflare Worker riêng (thư mục `worker/`) chạy trợ lý AI (OpenAI Agents SDK) để thao tác board bằng ngôn ngữ tự nhiên — xem mục [Trợ lý AI (Agent)](#trợ-lý-ai-agent) bên dưới.

## Lệnh thường dùng

```bash
npm run dev       # chạy dev server (mặc định http://localhost:5173)
npm run build     # tsc -b && vite build
npm run lint      # oxlint
npx vitest run    # chạy toàn bộ test
npx vitest        # chạy test ở chế độ watch
```

Không có lệnh `npm test` riêng — dùng `npx vitest run`.

Với Cloudflare Worker của trợ lý AI (chạy trong thư mục `worker/`):

```bash
npx wrangler deploy                  # deploy Worker (frontend deploy riêng, xem mục Deploy)
npx wrangler tail --format pretty    # xem log Worker realtime — cách nhanh nhất để biết agent lỗi gì
npx wrangler secret put <NAME>       # set secret (OPENAI_API_KEY, SUPABASE_ANON_KEY, GEMINI/ANTHROPIC/OPENROUTER_API_KEY)
npx tsc --noEmit                     # type-check Worker (không nằm trong `npm run build` của frontend)
```

Khi debug lỗi 500 từ trợ lý, `wrangler tail` cho thấy thông báo lỗi thật (vd schema Zod không hợp lệ) — nhanh hơn nhiều so với đoán từ phía frontend.

Kiểm tra frontend đã deploy xong chưa: so tên file bundle giữa local và production.

```bash
npm run build && ls dist/assets/*.js
curl -s https://kanban-board-amc.pages.dev/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
```

## Kiến trúc

- `src/board/` — logic board chính
  - `boardReducer.ts` — reducer thuần cho state của một board (cột/thẻ), có test đi kèm (`boardReducer.test.ts`)
  - `appReducer.ts` — reducer cấp app, quản lý nhiều board (xem `BoardAction` trong `types.ts`)
  - `BoardContext.tsx` — React context bọc reducer + persistence
  - `Board.tsx`, `Column.tsx`, `Card.tsx`, `CardModal.tsx` — UI, dnd-kit cho kéo thả
  - `BoardSwitcher.tsx` — chuyển đổi giữa nhiều board
  - `AgentChat.tsx` — panel chat trợ lý AI (nút 🤖 góc dưới phải), gồm luồng xác nhận trước khi xóa
  - `agentActions.ts` — validate/chuẩn hóa action do agent đề xuất trước khi dispatch, có test (`agentActions.test.ts`)
  - `avatar.ts` — sinh màu (1 màu trung tính, cố định) + initials cho avatar assignee từ tên tự do
  - `columnTitle.ts` — tách số thứ tự ở đầu tiêu đề cột để hiện badge, có test riêng
  - `useLocalStorage.ts` — hook persistence (localStorage), có test riêng
- `src/auth/` — `AuthContext.tsx` (quản lý session Supabase), `LoginScreen.tsx` (màn hình đăng nhập Google OAuth)
- `src/lib/supabaseClient.ts` — khởi tạo Supabase client, đọc từ `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- `src/theme/ThemeContext.tsx` — dark mode
- `src/types.ts` — types dùng chung: `Card`, `Column`, `Board`, `BoardAction`, `Priority`, `Subtask`
- `worker/` — Cloudflare Worker riêng biệt (không phải Cloudflare Pages) chạy trợ lý AI, xem mục [Trợ lý AI (Agent)](#trợ-lý-ai-agent)

State model: mỗi `Card` có `priority`, `labels`, `dueDate`, `enteredColumnAt` (để tính cycle time), `subtasks` (checklist việc con, mỗi item `{id, title, isDone}`), `assignee` (tên tự do, không phải liên kết tới user account thật — xem ghi chú bên dưới); mỗi `Column` có `wipLimit` tùy chọn và `isDone` để đánh dấu cột hoàn thành.

### Assignee — lưu ý quan trọng

`Card.assignee` là **text tự do**, không phải foreign key tới bảng user/account nào. Lý do: mỗi board hiện tại chỉ gắn với 1 owner (`owner_id` trên bảng `boards`), chưa hỗ trợ nhiều tài khoản cùng truy cập 1 board. Nếu sau này cần multi-user thật (mời người khác vào board, gán task cho tài khoản có thật), đây là thay đổi kiến trúc lớn — cần bảng `board_members` + RLS mới, không chỉ đổi kiểu dữ liệu của `assignee`.

Avatar của assignee dùng **1 màu cố định** (slate, xem `avatarColorFor` trong `avatar.ts`) — trước đó từng thử hash màu theo tên (nhiều màu) và indigo, nhưng đổi lại vì: (1) nhiều màu gây rối mắt khi board đã có nhiều màu cảnh báo khác, (2) indigo trùng màu với badge số thứ tự cột. Nếu định đổi lại màu avatar, tránh trùng với: indigo (số cột), đỏ (quá hạn), cam/vàng (sắp đến hạn, priority cao), tím (thẻ kẹt lâu), xanh lá (hoàn thành đúng/sớm hạn).

### Cảnh báo màu sắc trên Card — quy ước đã thống nhất

Board dùng nhiều màu cho các loại cảnh báo khác nhau trên `Card.tsx`, cố tình tách biệt để không gây nhầm lẫn:

- **Đỏ + nhấp nháy mạnh** (`animate-pulse-urgent`, định nghĩa trong `src/index.css`) — chỉ dành cho "quá hạn / hết hạn hôm nay" (dueDays ≤ 0). Đây là tín hiệu duy nhất trên board có animation nhấp nháy — không thêm animation cho các cảnh báo khác kẻo mất tác dụng gây chú ý.
- **Cam/vàng (amber)** — sắp đến hạn (≤3 ngày) hoặc priority cao.
- **Tím (violet), tĩnh không animation** — thẻ "kẹt" quá lâu ở 1 cột (cycle time cảnh báo, `STUCK_DANGER_DAYS`), khác hẳn ý nghĩa "quá hạn" nên không dùng đỏ.
- **Xanh lá** — hoàn thành đúng hạn/sớm hạn (badge completion status ở cột Done).

Nếu cần thêm loại cảnh báo mới, chọn màu chưa dùng ở trên và cân nhắc có thật sự cần animation không — animation chỉ nên dành cho đúng 1 mức độ khẩn cấp cao nhất.

## Backend / Auth

- Dữ liệu board hiện lưu qua Supabase (đã migrate từ localStorage-only, xem commit `783d9ea`). `useLocalStorage.ts` vẫn tồn tại nhưng vai trò đang chuyển dần sang Supabase — kiểm tra `BoardContext.tsx` để biết nguồn sự thật hiện tại trước khi giả định.
- Bảng `tasks` trên Supabase có thêm 2 cột `subtasks` (jsonb, mặc định `[]`) và `assignee` (text, nullable) — thêm bằng migration SQL chạy tay qua Supabase SQL Editor (không phải qua file migration trong repo, vì repo không dùng Supabase CLI/migration files). Nếu cần thêm cột mới cho `tasks` trong tương lai, làm tương tự: viết SQL, hướng dẫn user chạy trong SQL Editor, không có nơi nào trong repo tự động chạy migration.
- Auth dùng Supabase Google OAuth. Session state lấy **duy nhất** từ `onAuthStateChange` (xem commit `4823ee7` — cố tình không đọc session ban đầu qua cách khác để tránh state không nhất quán). Nếu đụng vào luồng OAuth, đọc kỹ lịch sử debug gần đây (`b317530`..`ff21306`) trước khi sửa.
- `signInWithGoogle` (`AuthContext.tsx`) truyền `queryParams: { prompt: "select_account" }` cho `signInWithOAuth` — bắt Google luôn hiện bảng chọn tài khoản, kể cả khi trình duyệt đã có sẵn session Google. Trước khi có dòng này, nếu đã đăng nhập Google trong trình duyệt, bấm nút "Đăng nhập với Google" sẽ tự động dùng tài khoản đang active mà không hỏi lại — gây khó khi cần đổi tài khoản hoặc test multi-account (commit `019b92b`).
- Biến môi trường cần thiết: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (xem `.env.example`). `.env` đã có sẵn cục bộ, không commit.

## Trợ lý AI (Agent)

- Người dùng thao tác board bằng ngôn ngữ tự nhiên qua panel chat (`src/board/AgentChat.tsx`, nút 🤖 nổi ở góc dưới phải Board). Component đọc board hiện tại từ `useBoard()`, gửi kèm prompt lên 1 Cloudflare Worker riêng.
- **Kiến trúc quan trọng — không gọi OpenAI trực tiếp từ frontend**: app là client-side thuần (`VITE_*` biến môi trường đều public, bundle vào code chạy trên trình duyệt), nên OpenAI API key **không thể** nằm trong frontend — bất kỳ ai mở DevTools cũng lấy được. Vì vậy có 1 Cloudflare Worker riêng (thư mục `worker/`, **khác** với Cloudflare Pages đang host frontend) giữ vai trò backend duy nhất gọi OpenAI.
- **Worker** (`worker/src/index.ts`): dùng `@openai/agents` (cần `compatibility_flags = ["nodejs_compat"]` trong `wrangler.toml` vì SDK cần Node APIs), model `gpt-5.6-luna`. Nhận `{ prompt, board, boards, history }`, trả về `{ reply, actions }` với `actions` gần đúng schema `AppAction` (`appReducer.ts`) — dùng Zod `outputType` để ép agent trả structured output. `history` là 10 lượt chat gần nhất, cần cho các yêu cầu nối tiếp kiểu "đổi ưu tiên task đó".
- **Worker không đụng vào Supabase để ghi dữ liệu** — nó chỉ "dịch" ngôn ngữ tự nhiên thành danh sách `AppAction`, còn frontend là nơi duy nhất `dispatch()` các action đó qua reducer sẵn có (giống hệt khi người dùng thao tác tay), nên tự động đi qua đúng luồng sync Supabase hiện có trong `BoardContext.tsx`. Không tạo đường ghi dữ liệu song song.
- **Không tin tưởng mù quáng output của agent**: `src/board/agentActions.ts` (`sanitizeAgentActions`) validate lại từng action trước khi dispatch — loại bỏ action tham chiếu tới `columnId`/`cardId`/`boardId` không có thật (chặn agent "ảo giác" ra id), kiểm giá trị từng field (định dạng ngày, priority hợp lệ, text không phải ký tự vô nghĩa), và cấp lại UUID thật cho mọi subtask agent đề xuất. Trả về `{ actions, dropped }` — `dropped` được hiển thị trong chat, **đừng bỏ đi**: action bị loại bỏ âm thầm là thứ khiến nhiều bug ở đây khó phát hiện.
- **`patch` là MẢNG `{field, value}`, không phải object** (xem `PatchFieldSchema` trong Worker và `buildPatch` trong `agentActions.ts`). Lý do lịch sử quan trọng: OpenAI Structured Outputs không nhận `.optional()` trần, phải kèm `.nullable()` — nghĩa là object patch buộc model phải điền **mọi** field kể cả field không muốn đổi. `gpt-5.6-luna` từng điền `"."` thay vì `null`, xóa mất tiêu đề thẻ và ghi `dueDate: "."` khiến Postgres từ chối **toàn bộ** batch upsert (mọi thay đổi sau đó im lặng không lưu được). Dạng mảng không có chỗ cho "field không đổi" nên không thể sai kiểu đó. **Không quay lại dạng object.**
- **Xóa dữ liệu luôn phải xác nhận**: `isDestructiveAction` tách `removeCard`/`removeColumn`/`removeBoard` ra khỏi các action khác; chúng được giữ lại trong `pendingDeletions` và chỉ dispatch khi người dùng bấm nút trong `AgentChat`. Ô nhập bị khóa trong lúc chờ — trước đó người dùng gõ "yes" để xác nhận, tạo ra request mới đi tìm thẻ vừa bị xóa. Agent vẫn **phải** gửi action xóa như bình thường (hướng dẫn trong Worker nói rõ điều này) — có lần model tự ý giữ action lại để "hỏi trước", kết quả là không có gì xảy ra cả.
- **Thao tác ở board khác board đang mở**: reducer chỉ áp `BoardAction` lên board active, nên `sanitizeAgentActions` tra `columnId`/`cardId` trên **mọi** board và tự chèn `switchBoard` phía trước. Với thao tác xóa, `switchBoard` đi kèm vào nhóm chờ xác nhận thay vì chạy ngay, để không kéo người dùng sang board khác trước khi họ đồng ý.
- **Xác thực Worker**: Worker yêu cầu header `Authorization: Bearer <supabase access token>`, verify bằng cách gọi `${SUPABASE_URL}/auth/v1/user` — chỉ user đã đăng nhập app mới gọi được Worker, tránh bị lạm dụng credit OpenAI.
- **`addCard` đã được mở rộng** để nhận thêm `patch?: Partial<Pick<Card, "description"|"labels"|"dueDate"|"priority"|"assignee"|"subtasks">>` (xem `types.ts`, `boardReducer.ts`) — lý do: agent cần tạo thẻ mới kèm đầy đủ thuộc tính (priority, assignee, due date...) trong 1 action duy nhất, vì reducer tự sinh UUID cho card mới nên agent không thể biết trước id để gọi `updateCard` nối tiếp.
- Sau khi sửa `agentActions.ts`, chạy `npx vitest run` — `agentActions.test.ts` giữ lại đúng các bug thật đã gặp (giá trị `"."`, ngày sai định dạng, id bịa, thao tác cross-board).
- **Chọn model (4 model)**: picker ở header panel chat, lưu bằng `useLocalStorage` (khóa `kanban.agentModel`). Frontend chỉ gửi **khóa ngắn** `model: "gpt" | "gemini" | "claude" | "deepseek"`; nhãn hiển thị và **id model thật chỉ nằm trong bảng `MODELS`** của Worker, frontend lấy về qua `GET /models`. Nhờ vậy đổi/nâng model chỉ cần deploy Worker, không phải deploy lại frontend — **đừng chép id model vào frontend**. Giá trị thiếu/lạ rơi về `gpt` (`resolveProvider`) nên frontend bản cũ vẫn chạy với Worker mới.

  | Khóa | Id thật | Transport | Đi qua | Secret |
  |---|---|---|---|---|
  | `gpt` | `gpt-5.6-luna` | `openai` | OpenAI (client mặc định của SDK) | `OPENAI_API_KEY` |
  | `gemini` | `gemini-3.5-flash-lite` | `openai` | `generativelanguage.googleapis.com/v1beta/openai/` | `GEMINI_API_KEY` |
  | `claude` | `claude-sonnet-5` | **`anthropic`** | `api.anthropic.com/v1/messages` (tool use) | `ANTHROPIC_API_KEY` |
  | `deepseek` | `deepseek/deepseek-v4-flash` | `openai` | `openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |

- **Mặc định mọi provider đi qua lớp tương thích OpenAI** (`OpenAIChatCompletionsModel` của `@openai/agents`), trừ OpenAI dùng client mặc định — cố ý **không** viết đường gọi REST riêng cho từng provider, vì như vậy sẽ có nhiều chỗ sinh structured output và các bài học về dạng `patch` (mảng, không phải object) sẽ phải học lại ở mỗi chỗ. Nếu một provider từ chối schema, ưu tiên đổi `baseURL`/`secret` của model đó sang OpenRouter (một dòng trong `MODELS`) trước khi nghĩ tới việc tách đường gọi riêng.

- **Ngoại lệ duy nhất: Claude phải gọi API gốc `/v1/messages`** (`transport: "anthropic"`, hàm `runViaAnthropic`). Đây **không phải** lựa chọn tùy hứng — đường tương thích OpenAI của Anthropic bị bịt kín bởi 2 điều kiện loại trừ nhau, đã thử và có log:

  1. `api.anthropic.com/v1/chat/completions` bắt buộc `response_format.json_schema.strict = true` → gửi `strict: false` bị trả `400 response_format.json_schema.strict: Input should be True`.
  2. Nhưng khi `strict: true`, Anthropic biên dịch schema thành "grammar" (bộ luật chặn từng token sai) và schema của app vượt trần → `400 The compiled grammar is too large`.

  Schema lớn vì đúng phần đang bảo vệ dữ liệu: union 14 loại action × union `patch` 7 nhánh, mỗi nhánh `additionalProperties: false`. **Đừng thu nhỏ schema chỉ để chiều Anthropic.** OpenAI/Gemini/OpenRouter không có trần này.

  API gốc ép định dạng bằng **tool use** (schema là mô tả tham số của công cụ `emit_kanban_result`, không biên dịch thành grammar) nên không dính trần. Đổi lại tool use **không bảo đảm cứng** định dạng như structured output ⇒ nhánh này **bắt buộc** `AgentOutputSchema.safeParse` lại trong Worker, sai thì trả 502 kèm câu tiếng Việt. Đừng bỏ bước validate đó.

  Quan trọng: `input_schema` của tool sinh từ **chính `AgentOutputSchema`** qua `zodToJsonSchema(..., { $refStrategy: "none" })`. Nguồn sự thật của schema vẫn là một — chỉ khác cách gửi HTTP. Nếu sửa schema, cả 4 model tự động đi theo, không phải sửa 2 nơi.

  Đã thử và **không dùng được**: Claude qua OpenRouter (`anthropic/claude-sonnet-5`) — chạy được nhưng vòng qua bên thứ ba và bỏ phí credit Anthropic; giữ lại đây như phương án dự phòng nếu key Anthropic hỏng, đổi `transport`/`baseURL`/`secret` là xong.
- `GET /models` trả `{key, label, id, available}` — `available` tính từ việc secret tương ứng đã set hay chưa, để picker hiện mờ model chưa có key thay vì để người dùng chọn rồi mới báo lỗi. Route này **không yêu cầu đăng nhập** (chỉ có nhãn + id model, không phải bí mật) và panel chat cần nó trước khi người dùng gửi yêu cầu đầu tiên.
- Chọn model mà Worker chưa có key → trả 400 kèm câu hướng dẫn set đúng tên secret; `AgentChat` đọc body cả khi response lỗi để hiện đúng câu đó thay vì mã trạng thái trần.
- Biến môi trường frontend cần thêm: `VITE_AGENT_WORKER_URL` (URL của Worker sau khi deploy) — xem `.env.example`.
- Worker cần 3 biến bắt buộc: `SUPABASE_URL` (var thường, đặt trong `wrangler.toml`), `OPENAI_API_KEY` và `SUPABASE_ANON_KEY` (secret, set bằng `wrangler secret put <NAME>`, **không** ghi giá trị thật vào `wrangler.toml`). Thêm secret tùy chọn cho từng model muốn bật: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`.
- Deploy Worker: `cd worker && npm install && npx wrangler deploy` (cần `wrangler login` trước nếu chưa). Đây là deploy thủ công qua CLI, **khác** với frontend (Cloudflare Pages, tự deploy qua Git integration) — 2 quy trình deploy độc lập, đừng nhầm lẫn.

## Deploy

- Frontend host tại **Cloudflare Pages**: https://kanban-board-amc.pages.dev
- Deploy qua **Git integration của Cloudflare Pages dashboard** (không phải CLI `wrangler`) — repo không có `wrangler.toml`/`wrangler.jsonc` vì không cần: mỗi lần push lên nhánh được theo dõi, Cloudflare tự build và deploy.
- Build command: `npm run build`; output directory: `dist`.
- Biến môi trường production (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) được cấu hình **trực tiếp trên Cloudflare Pages dashboard**, không nằm trong repo — nếu cần đổi/thêm biến môi trường cho production, phải vào dashboard chứ sửa `.env` cục bộ không có tác dụng.
- Thư mục `.wrangler/` xuất hiện cục bộ là cache build/dev, không phải config được commit — không cần quan tâm khi đọc code.

## Quy ước code

- TypeScript strict, functional React components + hooks, không dùng class component.
- State cập nhật qua reducer + action object (`BoardAction`) — không mutate state trực tiếp.
- Lint bằng `oxlint` (cấu hình ở `.oxlintrc.json`), không dùng ESLint.
- Test bằng Vitest + Testing Library, đặt cạnh file nguồn dạng `*.test.ts`.
- Không có backend server riêng cho phần board/auth — mọi thứ chạy client-side, gọi thẳng Supabase. Ngoại lệ duy nhất là Cloudflare Worker cho trợ lý AI (`worker/`), bắt buộc phải có vì lý do bảo mật OpenAI API key — xem mục [Trợ lý AI (Agent)](#trợ-lý-ai-agent).

## Lịch sử phát triển (tóm tắt từ git log)

Ghi chú: đây là tóm tắt dựa trên lịch sử commit thật (`git log`), không phải nhật ký hội thoại — dùng để nắm nhanh app đã đi qua những giai đoạn nào mà không cần đọc lại từng phiên chat cũ.

1. **Khởi tạo** — scaffold Vite + React + TS + Tailwind, định nghĩa types và pure reducer có test (`642f114`, `8fad25c`).
2. **Board cơ bản** — Card/Column/Board components, kéo thả bằng dnd-kit, persistence qua localStorage (`ff37fc3`, `761f76b`, `3c68c52`).
3. **Tính năng quản lý công việc** — cột Review, WIP limit, progress bar, cảnh báo due-soon, tìm kiếm thẻ, cycle time tracking (`enteredColumnAt`), badge early/on-time/late cho cột Done (`a869f09` → `73524c8`).
4. **Đa board + UX polish** — hỗ trợ nhiều board độc lập, board switcher, dark mode, animation thêm/xóa thẻ bằng framer-motion, xác nhận trước khi xóa thẻ (`a64641d`, `8b86808`, `ad482f5`, `ce50c66`).
5. **Migrate backend sang Supabase** — chuyển từ localStorage-only sang Supabase (Postgres + Google OAuth login), schema quan hệ (`783d9ea`). Đây là thay đổi kiến trúc lớn nhất tính đến nay.
6. **Debug OAuth session** — sau migrate, gặp bug session không nhất quán lúc load lại trang; đã thử log debug, expose client lên `window` để chẩn đoán, sau đó fix bằng cách chỉ tin `onAuthStateChange` làm nguồn sự thật duy nhất cho session, rồi dọn sạch code debug (`b317530` → `ff21306`). **Nếu gặp lại bug OAuth session tương tự, đọc lại các commit này trước khi debug từ đầu.**
7. **Deploy production** — frontend đang chạy tại Cloudflare Pages (https://kanban-board-amc.pages.dev), xem mục [Deploy](#deploy) ở trên.
8. **Subtask, assignee, redesign UI** — thêm checklist việc con và người phụ trách (text tự do, chưa gắn tài khoản thật) cho mỗi thẻ, filter board theo assignee, redesign lại Column/Board/CardModal, tinh chỉnh lại hệ thống màu cảnh báo (đỏ nhấp nháy = quá hạn, cam/vàng = sắp đến hạn, tím tĩnh = thẻ kẹt lâu) để giảm nhiễu thị giác (commit `89380ab`). Xem chi tiết quy ước màu và lý do chọn ở mục [State model](#kiến-trúc) phía trên.
9. **OAuth: luôn hiện bảng chọn tài khoản Google** — thêm `prompt: select_account` vào request OAuth để không tự động đăng nhập bằng session Google có sẵn trong trình duyệt (commit `019b92b`). Đây là thay đổi nhỏ, không đụng tới logic `onAuthStateChange` đã fix ở mục 6.
10. **Trợ lý AI thao tác board bằng ngôn ngữ tự nhiên** — thêm Cloudflare Worker riêng (`worker/`, OpenAI Agents SDK, model `gpt-5.6-luna`) dịch prompt tiếng Việt thành các `AppAction` có sẵn, frontend validate rồi dispatch qua reducer hiện có (không tạo đường ghi dữ liệu song song vào Supabase). Đây là backend đầu tiên của app ngoài Supabase — xem chi tiết ở mục [Trợ lý AI (Agent)](#trợ-lý-ai-agent).
11. **Gia cố agent sau các sự cố thật khi dùng** — đổi `patch` sang dạng mảng `{field, value}` vì model điền giá trị giữ chỗ làm mất dữ liệu thẻ và chặn sync Supabase (`5c2790d`); bắt buộc xác nhận trước mọi thao tác xóa (`67400f4`, `4e61170`); cho phép thao tác trên board không active và báo cáo action bị loại bỏ (`222c5cb`); chat tự cuộn + giữ `switchBoard` lại tới khi xác nhận (`0996454`). Các quyết định này đều xuất phát từ bug thật, đọc mục [Trợ lý AI (Agent)](#trợ-lý-ai-agent) trước khi đổi lại.
12. **Polish giao diện chat + vá lỗ hổng xác nhận xóa** — chat đổi sang tông cam của header, nút 🤖 to hơn kèm hiệu ứng vòng sáng (`animate-pulse-halo`, khác kiểu nhấp nháy đỏ của thẻ quá hạn), ô nhập co giãn theo nội dung có viền cam (`41729ae`, `4550d0d`, `a178ba7`); badge số cột nhận cả dạng "5 Test" không dấu chấm (`3ed0715`); xóa cột rỗng bằng tay giờ cũng hỏi xác nhận như xóa thẻ (`09f330b`).

13. **Trợ lý chọn được 4 model (GPT / Gemini / Claude / DeepSeek)** — picker ở panel chat lấy danh sách từ `GET /models` của Worker; bảng `MODELS` trong Worker là nguồn duy nhất của id model. Ba model dùng chung đường structured output qua lớp tương thích OpenAI; riêng Claude phải gọi API gốc `/v1/messages` bằng tool use vì đường tương thích của Anthropic vừa bắt buộc `strict: true` vừa từ chối grammar sinh ra từ schema này — đọc kỹ mục [Trợ lý AI (Agent)](#trợ-lý-ai-agent) trước khi định "dọn cho gọn" thành một đường duy nhất.

Khi cần biết chi tiết hơn một giai đoạn, dùng `git log --oneline` hoặc `git show <hash>` — hash commit ở trên là mốc tra cứu chính xác hơn là hỏi lại người dùng.

## Lưu ý khi sửa code

- Sau khi sửa logic reducer (`boardReducer.ts`, `appReducer.ts`) hoặc `useLocalStorage.ts`, chạy `npx vitest run` để xác nhận không vỡ test.
- Không thêm debug logging hoặc expose object lên `window` rồi quên xóa — lịch sử gần đây có vài commit riêng chỉ để dọn debug logging OAuth (`5b6f87c` → `ff21306`), tránh lặp lại.
- Không commit `.env` hoặc bất kỳ khóa Supabase nào. Ghi chú chứa khóa để cạnh project (vd `Secret Keys.docx`) đã được `.gitignore` chặn sẵn — nhưng OpenAI API key và service_role key **không bao giờ** được đưa vào `.env` của frontend, vì Vite nhúng mọi biến `VITE_*` vào bundle chạy trên trình duyệt. Chúng chỉ thuộc về `wrangler secret`.
- **Mọi thao tác xóa đều phải hỏi trước** — xóa thẻ, xóa cột (kể cả cột rỗng), xóa board, và cả khi trợ lý AI đề xuất xóa. Thao tác tay dùng `window.confirm`; trợ lý AI dùng khung xác nhận trong `AgentChat.tsx`. Nếu thêm đường xóa mới, giữ đúng quy ước này.
- App là **client-authoritative**: reducer đổi state local trước, `BoardContext.tsx` sync lên Supabase sau. Khi sync lỗi, UI **vẫn hiện như đã thành công** — một thẻ dữ liệu hỏng có thể làm cả batch upsert bị Postgres từ chối, khiến mọi thay đổi tiếp theo im lặng không lưu được. Khi nghi ngờ, mở Console tìm `Failed to sync ... to Supabase` và kiểm tra lại bằng cách F5.
- Frontend và Worker deploy **độc lập**: sửa `worker/` thì phải `npx wrangler deploy`, push git không tự deploy Worker. Ngược lại sửa `src/` thì push git là đủ. Quên bước này dẫn tới frontend mới chạy với Worker cũ (hoặc ngược lại) — đã gây vài lần debug nhầm hướng.

## Trạng thái hiện tại

Đã chạy production và được người dùng kiểm thử: board/cột/thẻ, kéo thả, subtask, assignee + filter, dark mode, đa board, đăng nhập Google, và trợ lý AI (tạo/sửa/xóa/di chuyển thẻ, cột, board bằng tiếng Việt, có xác nhận trước khi xóa, làm việc được cả với board không đang mở).

Ý tưởng đã bàn nhưng **chưa làm**: bình luận & nhật ký hoạt động trên thẻ, đính kèm file (Supabase Storage), sắp xếp nâng cao trong cột. Multi-user thật (nhiều tài khoản chung 1 board) là thay đổi kiến trúc lớn — xem ghi chú ở mục [Assignee](#assignee--lưu-ý-quan-trọng).
