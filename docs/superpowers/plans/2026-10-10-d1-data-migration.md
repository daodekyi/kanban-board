# Chuyển dữ liệu board từ Supabase sang Cloudflare D1 (giai đoạn 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dữ liệu board/cột/thẻ lưu trên Cloudflare D1 thay vì Supabase Postgres, đọc/ghi qua Worker sẵn có; đăng nhập Google **vẫn là Supabase Auth**.

**Architecture:** Worker `kanban-agent-worker` (đang chạy trợ lý AI) có thêm 2 route `GET /data` và `POST /data/sync`, gắn D1 qua binding `DB`. Worker xác thực token Supabase để lấy `user.id`, rồi **mọi** câu SQL đều lọc theo `owner_id = <user.id>` — đây là thứ thay cho RLS của Supabase. Frontend không gọi `supabase.from(...)` nữa: nó gửi phần chênh lệch (diff) giữa state hiện tại và lần sync thành công gần nhất. Lần đầu mở app sau khi đổi, D1 còn trống → frontend đọc dữ liệu cũ từ Supabase và đẩy lên D1 một lần.

**Tech Stack:** Cloudflare Workers + D1 (SQLite), wrangler 3.114, Zod 3 (Worker), React 18 + Vitest 4 (frontend), `node:sqlite` (Node 24) để test SQL thật trong Vitest.

**Spec:** Không có file spec riêng. Quyết định đã chốt với người dùng ngày 10/10/2026:
- Mục tiêu: gom backend về Cloudflare (người dùng muốn, Thầy cũng khuyên).
- Làm 2 giai đoạn. **Giai đoạn 1 (plan này):** chỉ chuyển dữ liệu, giữ Supabase Auth. Giai đoạn 2 (plan khác, sau): chuyển đăng nhập.
- Bảo mật: không ai thấy/sửa/xóa được board của người khác.
- Dữ liệu cũ trên Supabase phải được chuyển sang, không mất.

## Global Constraints

- Không thu nhỏ hay đổi schema/agent của trợ lý AI; route agent hiện tại (`POST` vào URL gốc của Worker) giữ nguyên hành vi.
- Biến môi trường frontend giữ nguyên tên `VITE_AGENT_WORKER_URL` (đã cấu hình trên Cloudflare Pages dashboard) — dùng chung cho cả agent và data. Không thêm biến mới.
- Không ghi khóa thật vào `wrangler.toml`; `database_id` của D1 **không phải bí mật**, được ghi vào `wrangler.toml`.
- Mọi câu SQL trong Worker phải có tham số `owner_id` lấy từ token đã xác thực — **không bao giờ** lấy `owner_id` từ body request.
- D1 gói Free: tối đa **100 tham số bind mỗi câu SQL**, **50 truy vấn mỗi lần gọi Worker**, **100.000 dòng ghi/ngày** (từ 1/9/2026 vượt là lỗi cứng tới nửa đêm UTC). Mỗi request sync tối đa **200 dòng** (`MAX_ROWS_PER_SYNC`).
- Dữ liệu trên Supabase **không xóa, không sửa** trong giai đoạn 1 (giữ làm bản dự phòng).
- Deploy Worker **trước**, frontend **sau** (frontend mới gọi `/data`, Worker cũ không có route này).
- Không để lại log debug / object gắn lên `window` (quy ước trong CLAUDE.md).
- Comment trong code viết tiếng Việt, đúng giọng các comment sẵn có trong `worker/src/index.ts`.

## Review Focus

1. **Supabase lỗi lúc chuyển dữ liệu lần đầu** — `loadSupabaseBoards` phải *ném lỗi*, không được coi lỗi là "trống". Nếu coi là trống, app tạo board mặc định trên D1 và từ đó D1 không còn trống ⇒ dữ liệu cũ không bao giờ được chuyển nữa. Pin bằng test ở Task 5 (thứ tự xử lý trong `loadInitialBoards`).
2. **Lần chuyển đầu bị đứt giữa chừng** (mạng rớt sau vài chunk) — board phải được ghi **sau cùng**, để lần tải lại thấy D1 vẫn "chưa có board" và chuyển lại từ đầu (upsert lặp lại vô hại). Pin bằng test thứ tự chunk ở Task 4.
3. **Người dùng B gửi id của người dùng A** (upsert đè hoặc xóa) — phải không có tác dụng gì với dữ liệu của A. Pin bằng test SQLite thật ở Task 2.
4. **Một dòng có giá trị sai** (vd `due_date: "."`) — Worker từ chối cả request với thông báo chỉ rõ dòng nào; frontend giữ nguyên snapshot cũ, hiện băng báo "Chưa lưu được", cho bấm "Thử lại". Không được im lặng như trước. Pin ở Task 2 (Worker) và Task 4 (hàng đợi sync).
5. **Người dùng thao tác nhanh trong lúc đang sync** (kéo thả liên tục) — các thay đổi dồn lại thành 1 lần gửi tiếp theo, không gửi chồng chéo, không mất thay đổi cuối. Pin ở Task 4.

---

## Bản đồ file

| File | Trách nhiệm |
|---|---|
| `worker/migrations/0001_init.sql` (mới) | Schema D1: 3 bảng + index theo `owner_id` |
| `worker/src/auth.ts` (mới) | `verifyUser` trả về id user (thay bản trả boolean trong `index.ts`), `bearerToken` |
| `worker/src/data.ts` (mới) | Zod schema cho payload sync, sinh câu SQL có `owner_id`, `loadRows`, `syncRows`, adapter D1 |
| `worker/src/index.ts` (sửa) | Thêm binding `DB`, route `/data`, `/data/sync`; dùng `verifyUser` từ `auth.ts` |
| `worker/wrangler.toml` (sửa) | Khai báo `[[d1_databases]]` |
| `worker/test/auth.test.ts`, `worker/test/data.test.ts`, `worker/test/sqliteRunner.ts` (mới) | Test Worker, chạy bằng `npx vitest run` ở thư mục gốc |
| `src/board/boardRows.ts` (mới) | Chuyển `Board[]` ⇄ dòng bảng, snapshot, diff, chia chunk (tách ra từ `BoardContext.tsx`) |
| `src/board/syncQueue.ts` (mới) | Hàng đợi sync: một lần gửi tại một thời điểm, dồn thay đổi, giữ snapshot khi lỗi |
| `src/lib/dataApi.ts` (mới) | Gọi `GET /data`, `POST /data/sync` trên Worker |
| `src/lib/legacySupabase.ts` (mới) | Đọc dữ liệu cũ từ Supabase cho lần chuyển đầu |
| `src/board/loadInitialBoards.ts` (mới) | Quyết định nguồn dữ liệu lúc mở app: D1 → Supabase → localStorage cũ → board mặc định |
| `src/board/BoardContext.tsx` (sửa) | Dùng các module trên; màn hình lỗi tải; băng "Chưa lưu được" + nút "Thử lại" |
| `CLAUDE.md` (sửa) | Cập nhật kiến trúc, deploy, lịch sử |

---

### Task 1: Schema D1 + `verifyUser` trả về id user

**Files:**
- Create: `worker/migrations/0001_init.sql`
- Create: `worker/src/auth.ts`
- Create: `worker/test/auth.test.ts`
- Modify: `worker/src/index.ts` (xóa hàm `verifyUser` cũ ở khoảng dòng 253-264, sửa chỗ gọi ở khoảng dòng 316-321)

**Interfaces:**
- Produces: `verifyUser(token: string, env: AuthEnv): Promise<string | null>`, `bearerToken(request: Request): string`, `interface AuthEnv { SUPABASE_URL: string; SUPABASE_ANON_KEY: string }`. File `0001_init.sql` được Task 2 nạp vào SQLite trong test.

- [ ] **Step 1: Viết migration**

`worker/migrations/0001_init.sql`:

```sql
-- Giai đoạn 1 chuyển khỏi Supabase: cùng tên bảng/cột như Postgres cũ để
-- frontend giữ nguyên dạng dòng. Không có RLS ở SQLite — Worker tự lọc mọi câu
-- theo owner_id lấy từ token đã xác thực (xem worker/src/data.ts).
-- Cố ý không dùng FOREIGN KEY: thứ tự ghi giữa các chunk sync không bảo đảm,
-- và đọc luôn lọc theo owner_id nên dòng "mồ côi" không lộ ra cho ai.
CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  board_order INTEGER NOT NULL
);

CREATE TABLE columns (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  title TEXT NOT NULL,
  col_order INTEGER NOT NULL,
  is_done INTEGER NOT NULL DEFAULT 0,
  wip_limit INTEGER
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  column_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  labels TEXT NOT NULL DEFAULT '[]',
  priority TEXT NOT NULL,
  due_date TEXT,
  task_order INTEGER NOT NULL,
  entered_column_at TEXT,
  subtasks TEXT NOT NULL DEFAULT '[]',
  assignee TEXT
);

CREATE INDEX boards_owner_idx ON boards(owner_id);
CREATE INDEX columns_owner_idx ON columns(owner_id);
CREATE INDEX tasks_owner_idx ON tasks(owner_id);
```

- [ ] **Step 2: Viết test thất bại cho `auth.ts`**

`worker/test/auth.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { bearerToken, verifyUser } from "../src/auth";

const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" };

afterEach(() => vi.unstubAllGlobals());

describe("verifyUser", () => {
  it("trả về id user khi Supabase xác nhận token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "user-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyUser("tok", env)).toBe("user-1");
    expect(fetchMock).toHaveBeenCalledWith("https://x.supabase.co/auth/v1/user", {
      headers: { Authorization: "Bearer tok", apikey: "anon" },
    });
  });

  it("null khi Supabase trả 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    expect(await verifyUser("tok", env)).toBeNull();
  });

  it("null khi body không có id dạng chuỗi", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 5 }), { status: 200 })));
    expect(await verifyUser("tok", env)).toBeNull();
  });

  it("null và không gọi mạng khi token rỗng", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyUser("", env)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("null khi fetch ném lỗi mạng", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await verifyUser("tok", env)).toBeNull();
  });
});

describe("bearerToken", () => {
  it("bóc token khỏi header Authorization", () => {
    expect(bearerToken(new Request("https://w/", { headers: { Authorization: "Bearer abc" } }))).toBe("abc");
  });
  it("chuỗi rỗng khi không có header", () => {
    expect(bearerToken(new Request("https://w/"))).toBe("");
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `npx vitest run worker/test/auth.test.ts`
Expected: FAIL — `Failed to resolve import "../src/auth"`.

- [ ] **Step 4: Viết `worker/src/auth.ts`**

```ts
export interface AuthEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

export function bearerToken(request: Request): string {
  return (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
}

/**
 * Hỏi Supabase token này của ai. Trả về id user, hoặc null nếu token không
 * hợp lệ. Phải trả về id (không chỉ true/false) vì route /data dùng chính id
 * này làm owner_id cho mọi câu SQL — đây là lớp thay cho RLS của Postgres.
 */
export async function verifyUser(token: string, env: AuthEnv): Promise<string | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: unknown };
    return typeof user.id === "string" && user.id !== "" ? user.id : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Sửa `worker/src/index.ts` dùng `auth.ts`**

Thêm import ở đầu file:

```ts
import { bearerToken, verifyUser } from "./auth";
```

Xóa nguyên hàm `async function verifyUser(token: string, env: Env): Promise<boolean> { ... }`.

Thay đoạn:

```ts
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const authorized = await verifyUser(token, env);
    if (!authorized) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
```

bằng:

```ts
    const userId = await verifyUser(bearerToken(request), env);
    if (!userId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
```

- [ ] **Step 6: Chạy test + type-check Worker**

Run: `npx vitest run worker/test/auth.test.ts` → Expected: 7 passed.
Run: `cd worker && npx tsc --noEmit` → Expected: không lỗi.

- [ ] **Step 7: Commit**

```bash
git add worker/migrations/0001_init.sql worker/src/auth.ts worker/src/index.ts worker/test/auth.test.ts
git commit -m "feat(worker): D1 schema and verifyUser returning the user id"
```

---

### Task 2: Lớp dữ liệu của Worker (`data.ts`) — test bằng SQLite thật

**Files:**
- Create: `worker/src/data.ts`
- Create: `worker/test/sqliteRunner.ts`
- Create: `worker/test/data.test.ts`

**Interfaces:**
- Consumes: `worker/migrations/0001_init.sql` (Task 1).
- Produces (Task 3 dùng):
  - `type SqlValue = string | number | null`
  - `interface Stmt { sql: string; params: SqlValue[] }`
  - `interface SqlRunner { all(sql: string, params: SqlValue[]): Promise<Record<string, unknown>[]>; batch(stmts: Stmt[]): Promise<void> }`
  - `const MAX_ROWS_PER_SYNC = 200`, `const MAX_PARAMS = 100`
  - `buildSyncStatements(ownerId: string, payload: SyncPayload): Stmt[]`
  - `loadRows(db: SqlRunner, ownerId: string): Promise<{ boards; columns; tasks }>` (dạng dòng giống Task 4: `is_done` là boolean, `labels`/`subtasks` là mảng)
  - `syncRows(db: SqlRunner, ownerId: string, body: unknown): Promise<{ ok: true } | { ok: false; error: string }>`
  - `d1Runner(db: D1Database): SqlRunner`

- [ ] **Step 1: Viết adapter SQLite cho test**

`worker/test/sqliteRunner.ts`:

```ts
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { SqlRunner } from "../src/data";

/** SQLite trong bộ nhớ đã chạy migration thật — D1 cũng là SQLite nên kiểm được đúng ngữ nghĩa SQL. */
export function memoryRunner(): SqlRunner & { db: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
  return {
    db,
    async all(sql, params) {
      return db.prepare(sql).all(...params) as Record<string, unknown>[];
    },
    // D1 batch là một transaction: lỗi một câu thì cả lô bị hủy. Mô phỏng y vậy.
    async batch(stmts) {
      db.exec("BEGIN");
      try {
        for (const s of stmts) db.prepare(s.sql).run(...s.params);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}
```

- [ ] **Step 2: Viết test thất bại**

`worker/test/data.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildSyncStatements, loadRows, MAX_PARAMS, syncRows } from "../src/data";
import { memoryRunner } from "./sqliteRunner";

const A = "user-a";
const B = "user-b";

function task(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    column_id: "col-1",
    board_id: "board-1",
    title: `Thẻ ${id}`,
    description: null,
    labels: ["ui"],
    priority: "medium",
    due_date: "2026-10-20",
    task_order: 0,
    entered_column_at: "2026-10-10T12:00:00.000Z",
    subtasks: [{ id: "s1", title: "Việc con", isDone: false }],
    assignee: "Dekyi",
    ...extra,
  };
}

function payload(over: { boards?: unknown[]; columns?: unknown[]; tasks?: unknown[]; remove?: Partial<Record<"boardIds" | "columnIds" | "taskIds", string[]>> } = {}) {
  return {
    upsert: { boards: over.boards ?? [], columns: over.columns ?? [], tasks: over.tasks ?? [] },
    remove: { boardIds: [], columnIds: [], taskIds: [], ...over.remove },
  };
}

const board1 = { id: "board-1", title: "Học AI", board_order: 0 };
const col1 = { id: "col-1", board_id: "board-1", title: "1. To Do", col_order: 0, is_done: false, wip_limit: 3 };

describe("loadRows / syncRows", () => {
  it("user mới: cả 3 bảng rỗng", async () => {
    const db = memoryRunner();
    expect(await loadRows(db, A)).toEqual({ boards: [], columns: [], tasks: [] });
  });

  it("ghi rồi đọc lại đúng kiểu dữ liệu (boolean, mảng JSON)", async () => {
    const db = memoryRunner();
    const res = await syncRows(db, A, payload({ boards: [board1], columns: [col1], tasks: [task("t1")] }));
    expect(res).toEqual({ ok: true });
    const rows = await loadRows(db, A);
    expect(rows.boards).toEqual([board1]);
    expect(rows.columns).toEqual([col1]);
    expect(rows.tasks).toEqual([task("t1")]);
  });

  it("chủ board sửa được dữ liệu của chính mình", async () => {
    const db = memoryRunner();
    await syncRows(db, A, payload({ boards: [board1] }));
    await syncRows(db, A, payload({ boards: [{ ...board1, title: "Đổi tên" }] }));
    expect((await loadRows(db, A)).boards[0].title).toBe("Đổi tên");
  });

  it("xóa theo id chỉ xóa đúng dòng của chủ", async () => {
    const db = memoryRunner();
    await syncRows(db, A, payload({ tasks: [task("t1"), task("t2")] }));
    await syncRows(db, A, payload({ remove: { taskIds: ["t1"] } }));
    expect((await loadRows(db, A)).tasks.map((t) => t.id)).toEqual(["t2"]);
  });

  it("BẢO MẬT: B gửi id board của A để ghi đè — dữ liệu của A không đổi, B không thấy gì", async () => {
    const db = memoryRunner();
    await syncRows(db, A, payload({ boards: [board1], tasks: [task("t1")] }));
    await syncRows(db, B, payload({ boards: [{ ...board1, title: "Bị chiếm" }], tasks: [task("t1", { title: "Bị chiếm" })] }));
    const a = await loadRows(db, A);
    expect(a.boards[0].title).toBe("Học AI");
    expect(a.tasks[0].title).toBe("Thẻ t1");
    expect(await loadRows(db, B)).toEqual({ boards: [], columns: [], tasks: [] });
  });

  it("BẢO MẬT: B gửi lệnh xóa id của A — không xóa được", async () => {
    const db = memoryRunner();
    await syncRows(db, A, payload({ boards: [board1], columns: [col1], tasks: [task("t1")] }));
    await syncRows(db, B, payload({ remove: { boardIds: ["board-1"], columnIds: ["col-1"], taskIds: ["t1"] } }));
    const a = await loadRows(db, A);
    expect([a.boards.length, a.columns.length, a.tasks.length]).toEqual([1, 1, 1]);
  });

  it("BẢO MẬT: owner_id trong body bị bỏ qua, luôn dùng id từ token", async () => {
    const db = memoryRunner();
    await syncRows(db, B, payload({ boards: [{ ...board1, owner_id: A }] }));
    expect((await loadRows(db, A)).boards).toEqual([]);
    expect((await loadRows(db, B)).boards).toHaveLength(1);
  });

  it("từ chối giá trị sai, chỉ rõ dòng nào, không ghi gì cả", async () => {
    const db = memoryRunner();
    const res = await syncRows(db, A, payload({ boards: [board1], tasks: [task("t1"), task("t2", { due_date: "." })] }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("upsert.tasks.1.due_date");
    expect(await loadRows(db, A)).toEqual({ boards: [], columns: [], tasks: [] });
  });

  it("từ chối payload hơn 200 dòng", async () => {
    const db = memoryRunner();
    const tasks = Array.from({ length: 201 }, (_, i) => task(`t${i}`));
    const res = await syncRows(db, A, payload({ tasks }));
    expect(res.ok).toBe(false);
  });

  it("từ chối body không đúng dạng", async () => {
    expect((await syncRows(memoryRunner(), A, { foo: 1 })).ok).toBe(false);
  });

  it("ghi được 200 thẻ một lần (nhiều câu INSERT, mỗi câu ≤ 100 tham số)", async () => {
    const db = memoryRunner();
    const tasks = Array.from({ length: 200 }, (_, i) => task(`t${i}`, { task_order: i }));
    expect(await syncRows(db, A, payload({ tasks }))).toEqual({ ok: true });
    expect((await loadRows(db, A)).tasks).toHaveLength(200);
  });

  it("labels/subtasks hỏng trong DB đọc ra thành mảng rỗng thay vì làm sập", async () => {
    const db = memoryRunner();
    await syncRows(db, A, payload({ tasks: [task("t1")] }));
    db.db.prepare("UPDATE tasks SET labels = 'not json', subtasks = '{}' WHERE id = 't1'").run();
    const t = (await loadRows(db, A)).tasks[0];
    expect([t.labels, t.subtasks]).toEqual([[], []]);
  });
});

describe("buildSyncStatements", () => {
  const big = payload({
    boards: [board1],
    columns: [col1],
    tasks: Array.from({ length: 150 }, (_, i) => task(`t${i}`)),
    remove: { taskIds: Array.from({ length: 150 }, (_, i) => `old${i}`) },
  });

  it("mỗi câu không vượt 100 tham số bind của D1", () => {
    for (const s of buildSyncStatements(A, big as never)) expect(s.params.length).toBeLessThanOrEqual(MAX_PARAMS);
  });

  it("mọi câu DELETE đều lọc theo owner_id, và tham số đầu là owner", () => {
    const deletes = buildSyncStatements(A, big as never).filter((s) => s.sql.startsWith("DELETE"));
    expect(deletes.length).toBeGreaterThan(1);
    for (const s of deletes) {
      expect(s.sql).toContain("WHERE owner_id = ?");
      expect(s.params[0]).toBe(A);
    }
  });

  it("mọi câu INSERT chỉ cập nhật khi owner trùng", () => {
    const inserts = buildSyncStatements(A, big as never).filter((s) => s.sql.startsWith("INSERT"));
    for (const s of inserts) expect(s.sql).toMatch(/WHERE (boards|columns|tasks)\.owner_id = excluded\.owner_id$/);
  });

  it("payload rỗng ⇒ không có câu nào", () => {
    expect(buildSyncStatements(A, payload() as never)).toEqual([]);
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `npx vitest run worker/test/data.test.ts`
Expected: FAIL — `Failed to resolve import "../src/data"`.

- [ ] **Step 4: Viết `worker/src/data.ts`**

```ts
import { z } from "zod";

/**
 * Lớp dữ liệu board trên D1. Không có RLS như Postgres, nên quy tắc bảo mật
 * nằm hết ở đây: owner_id LUÔN lấy từ token đã xác thực (tham số `ownerId`),
 * không bao giờ từ body; mọi DELETE lọc theo owner_id; mọi UPSERT chỉ cập nhật
 * khi owner trùng — gửi id của người khác thì câu lệnh không có tác dụng gì.
 */

export type SqlValue = string | number | null;

export interface Stmt {
  sql: string;
  params: SqlValue[];
}

/** Đủ cho cả D1 lẫn SQLite của test — logic không phụ thuộc vào D1. */
export interface SqlRunner {
  all(sql: string, params: SqlValue[]): Promise<Record<string, unknown>[]>;
  batch(stmts: Stmt[]): Promise<void>;
}

/** Giới hạn của D1: 100 tham số bind mỗi câu SQL. */
export const MAX_PARAMS = 100;
/**
 * Số dòng tối đa mỗi request. Gói Free chỉ cho 50 truy vấn mỗi lần gọi Worker;
 * 200 dòng thẻ (13 cột) ≈ 29 câu INSERT, còn dư chỗ. Frontend tự chia nhỏ.
 */
export const MAX_ROWS_PER_SYNC = 200;

const Id = z.string().min(1).max(100);
const Text = (max: number) => z.string().max(max);

const BoardRowSchema = z.object({ id: Id, title: Text(2000), board_order: z.number().int() });

const ColumnRowSchema = z.object({
  id: Id,
  board_id: Id,
  title: Text(2000),
  col_order: z.number().int(),
  is_done: z.boolean(),
  wip_limit: z.number().int().min(0).nullable(),
});

const SubtaskSchema = z.object({ id: Id, title: Text(2000), isDone: z.boolean() });

const TaskRowSchema = z.object({
  id: Id,
  column_id: Id,
  board_id: Id,
  title: Text(2000),
  description: Text(50_000).nullable(),
  labels: z.array(Text(200)).max(100),
  priority: z.enum(["low", "medium", "high"]),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "phải là YYYY-MM-DD")
    .nullable(),
  task_order: z.number().int(),
  entered_column_at: Text(40).nullable(),
  subtasks: z.array(SubtaskSchema).max(500),
  assignee: Text(500).nullable(),
});

const SyncPayloadSchema = z
  .object({
    upsert: z.object({
      boards: z.array(BoardRowSchema),
      columns: z.array(ColumnRowSchema),
      tasks: z.array(TaskRowSchema),
    }),
    remove: z.object({ boardIds: z.array(Id), columnIds: z.array(Id), taskIds: z.array(Id) }),
  })
  .refine(
    (p) =>
      p.upsert.boards.length +
        p.upsert.columns.length +
        p.upsert.tasks.length +
        p.remove.boardIds.length +
        p.remove.columnIds.length +
        p.remove.taskIds.length <=
      MAX_ROWS_PER_SYNC,
    { message: `Tối đa ${MAX_ROWS_PER_SYNC} dòng mỗi lần sync` }
  );

export type SyncPayload = z.infer<typeof SyncPayloadSchema>;

const TABLES = {
  boards: ["id", "owner_id", "title", "board_order"],
  columns: ["id", "owner_id", "board_id", "title", "col_order", "is_done", "wip_limit"],
  tasks: [
    "id",
    "owner_id",
    "board_id",
    "column_id",
    "title",
    "description",
    "labels",
    "priority",
    "due_date",
    "task_order",
    "entered_column_at",
    "subtasks",
    "assignee",
  ],
} as const;

type Table = keyof typeof TABLES;

function deleteStatements(table: Table, ownerId: string, ids: string[]): Stmt[] {
  const out: Stmt[] = [];
  const perStmt = MAX_PARAMS - 1; // 1 chỗ cho owner_id
  for (let i = 0; i < ids.length; i += perStmt) {
    const chunk = ids.slice(i, i + perStmt);
    out.push({
      sql: `DELETE FROM ${table} WHERE owner_id = ? AND id IN (${chunk.map(() => "?").join(", ")})`,
      params: [ownerId, ...chunk],
    });
  }
  return out;
}

function upsertStatements(table: Table, rows: SqlValue[][]): Stmt[] {
  const cols = TABLES[table];
  const perStmt = Math.floor(MAX_PARAMS / cols.length);
  const placeholders = `(${cols.map(() => "?").join(", ")})`;
  const updates = cols
    .filter((c) => c !== "id" && c !== "owner_id")
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");
  const out: Stmt[] = [];
  for (let i = 0; i < rows.length; i += perStmt) {
    const chunk = rows.slice(i, i + perStmt);
    out.push({
      // WHERE ở nhánh DO UPDATE: id đã thuộc về người khác thì bỏ qua, không đè.
      sql:
        `INSERT INTO ${table} (${cols.join(", ")}) VALUES ${chunk.map(() => placeholders).join(", ")} ` +
        `ON CONFLICT(id) DO UPDATE SET ${updates} WHERE ${table}.owner_id = excluded.owner_id`,
      params: chunk.flat(),
    });
  }
  return out;
}

export function buildSyncStatements(ownerId: string, p: SyncPayload): Stmt[] {
  return [
    ...deleteStatements("tasks", ownerId, p.remove.taskIds),
    ...deleteStatements("columns", ownerId, p.remove.columnIds),
    ...deleteStatements("boards", ownerId, p.remove.boardIds),
    ...upsertStatements(
      "boards",
      p.upsert.boards.map((b) => [b.id, ownerId, b.title, b.board_order])
    ),
    ...upsertStatements(
      "columns",
      p.upsert.columns.map((c) => [c.id, ownerId, c.board_id, c.title, c.col_order, c.is_done ? 1 : 0, c.wip_limit])
    ),
    ...upsertStatements(
      "tasks",
      p.upsert.tasks.map((t) => [
        t.id,
        ownerId,
        t.board_id,
        t.column_id,
        t.title,
        t.description,
        JSON.stringify(t.labels),
        t.priority,
        t.due_date,
        t.task_order,
        t.entered_column_at,
        JSON.stringify(t.subtasks),
        t.assignee,
      ])
    ),
  ];
}

function parseJsonArray(value: unknown): unknown[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadRows(db: SqlRunner, ownerId: string) {
  const [boards, columns, tasks] = await Promise.all([
    db.all("SELECT id, title, board_order FROM boards WHERE owner_id = ?", [ownerId]),
    db.all("SELECT id, board_id, title, col_order, is_done, wip_limit FROM columns WHERE owner_id = ?", [ownerId]),
    db.all(
      "SELECT id, column_id, board_id, title, description, labels, priority, due_date, task_order, " +
        "entered_column_at, subtasks, assignee FROM tasks WHERE owner_id = ?",
      [ownerId]
    ),
  ]);
  return {
    boards: boards.map((b) => ({ ...b })),
    columns: columns.map((c) => ({ ...c, is_done: c.is_done === 1 })),
    tasks: tasks.map((t) => ({ ...t, labels: parseJsonArray(t.labels), subtasks: parseJsonArray(t.subtasks) })),
  };
}

export async function syncRows(
  db: SqlRunner,
  ownerId: string,
  body: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SyncPayloadSchema.safeParse(body);
  if (!parsed.success) {
    // Nêu rõ dòng nào sai (vd "upsert.tasks.3.due_date") — lỗi sync im lặng là
    // thứ từng khiến cả batch Postgres bị từ chối mà không ai biết.
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Dữ liệu sync không hợp lệ — ${detail}` };
  }
  const stmts = buildSyncStatements(ownerId, parsed.data);
  if (stmts.length > 0) await db.batch(stmts);
  return { ok: true };
}

export function d1Runner(db: D1Database): SqlRunner {
  return {
    async all(sql, params) {
      const result = await db.prepare(sql).bind(...params).all();
      return result.results as Record<string, unknown>[];
    },
    async batch(stmts) {
      await db.batch(stmts.map((s) => db.prepare(s.sql).bind(...s.params)));
    },
  };
}
```

Ghi chú: `boards.map((b) => ({ ...b }))` để bỏ prototype `null` của dòng `node:sqlite` cho `toEqual` so sánh ổn định; với D1 không ảnh hưởng.

- [ ] **Step 5: Chạy test**

Run: `npx vitest run worker/test/data.test.ts`
Expected: 16 passed. Nếu test "đọc lại đúng kiểu" lỗi vì thứ tự dòng, thêm `ORDER BY id` — không đổi assertion.

- [ ] **Step 6: Type-check Worker**

Run: `cd worker && npx tsc --noEmit` → Expected: không lỗi.

- [ ] **Step 7: Commit**

```bash
git add worker/src/data.ts worker/test/data.test.ts worker/test/sqliteRunner.ts
git commit -m "feat(worker): D1 data layer scoped by owner_id, tested on real SQLite"
```

---

### Task 3: Route `/data` trong Worker + binding D1

**Files:**
- Modify: `worker/src/index.ts` (interface `Env`, hàm `fetch` — chèn ngay sau khối `GET /models`)
- Modify: `worker/wrangler.toml`
- Create: `.claude/launch.json`

**Interfaces:**
- Consumes: `verifyUser`, `bearerToken` (Task 1); `d1Runner`, `loadRows`, `syncRows` (Task 2).
- Produces (HTTP, Task 4 gọi):
  - `GET /data` + `Authorization: Bearer <supabase token>` → `200 { boards, columns, tasks }` | `401 { error }` | `500 { error }`
  - `POST /data/sync` + body `SyncPayload` → `200 { ok: true }` | `400 { error }` | `401` | `500`

- [ ] **Step 1: Tạo database D1 (cần `wrangler login` sẵn)**

Run: `cd worker && npx wrangler d1 create kanban-db`
Expected: in ra khối toml có `database_id = "<uuid>"`. Chép uuid đó.

- [ ] **Step 2: Khai báo binding trong `worker/wrangler.toml`** (thêm cuối file, thay `<uuid>` bằng giá trị vừa in)

```toml
# Dữ liệu board (giai đoạn 1 chuyển khỏi Supabase). database_id không phải bí mật.
[[d1_databases]]
binding = "DB"
database_name = "kanban-db"
database_id = "<uuid>"
migrations_dir = "migrations"
```

- [ ] **Step 3: Áp migration lên D1 local**

Run: `cd worker && npx wrangler d1 migrations apply kanban-db --local`
Expected: `0001_init.sql` ✅.

- [ ] **Step 4: Sửa `worker/src/index.ts`**

Thêm import:

```ts
import { d1Runner, loadRows, syncRows } from "./data";
```

Thêm vào `interface Env`:

```ts
  /** D1 chứa board/cột/thẻ (khai báo trong wrangler.toml). */
  DB: D1Database;
```

Chèn ngay sau khối `if (request.method === "GET" && new URL(request.url).pathname === "/models") { ... }`:

```ts
    // Dữ liệu board. Xác thực TRƯỚC khi đọc body; userId từ token là owner_id
    // duy nhất được dùng trong SQL (xem worker/src/data.ts).
    const { pathname } = new URL(request.url);
    if (pathname === "/data" || pathname === "/data/sync") {
      const userId = await verifyUser(bearerToken(request), env);
      if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);
      const db = d1Runner(env.DB);
      try {
        if (request.method === "GET" && pathname === "/data") {
          return jsonResponse(await loadRows(db, userId));
        }
        if (request.method === "POST" && pathname === "/data/sync") {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return jsonResponse({ error: "Invalid JSON body" }, 400);
          }
          const result = await syncRows(db, userId, body);
          return result.ok ? jsonResponse({ ok: true }) : jsonResponse({ error: result.error }, 400);
        }
        return jsonResponse({ error: "Method not allowed" }, 405);
      } catch (err) {
        console.error(`D1 ${request.method} ${pathname} failed`, err);
        return jsonResponse({ error: "Lỗi cơ sở dữ liệu khi tải/lưu board." }, 500);
      }
    }
```

- [ ] **Step 5: Type-check + toàn bộ test**

Run: `cd worker && npx tsc --noEmit` → không lỗi.
Run: `npx vitest run` (thư mục gốc) → tất cả pass.

- [ ] **Step 6: Thử Worker local**

Tạo `worker/.dev.vars` (đã có trong `.gitignore`), lấy giá trị từ `.env` gốc (khóa anon là khóa công khai, giống hệt `VITE_SUPABASE_ANON_KEY`):

```
SUPABASE_ANON_KEY=<giá trị VITE_SUPABASE_ANON_KEY trong .env>
OPENAI_API_KEY=placeholder-local
```

Tạo `.claude/launch.json` (dùng lại ở Task 6):

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "worker", "runtimeExecutable": "npm", "runtimeArgs": ["--prefix", "worker", "run", "dev", "--", "--port", "8787"], "port": 8787 },
    { "name": "web", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 }
  ]
}
```

Khởi động `worker` bằng preview tool (`preview_start {name: "worker"}`), không chạy bằng Bash.
Run: `curl -s -w " %{http_code}\n" http://localhost:8787/data` → Expected: `{"error":"Unauthorized"} 401`
Run: `curl -s -w " %{http_code}\n" -X POST http://localhost:8787/data/sync -d '{}'` → Expected: `401`
Run: `curl -s http://localhost:8787/models` → Expected: vẫn trả danh sách model (route cũ không vỡ).

- [ ] **Step 7: Commit**

```bash
git add worker/src/index.ts worker/wrangler.toml
git commit -m "feat(worker): GET /data and POST /data/sync backed by D1"
```

---

### Task 4: Frontend — dòng bảng, diff, chunk, hàng đợi sync, API client

**Files:**
- Create: `src/board/boardRows.ts`, `src/board/boardRows.test.ts`
- Create: `src/board/syncQueue.ts`, `src/board/syncQueue.test.ts`
- Create: `src/lib/dataApi.ts`, `src/lib/dataApi.test.ts`

**Interfaces:**
- Consumes: HTTP contract của Task 3.
- Produces (Task 5 dùng):
  - `interface BoardRow { id: string; title: string; board_order: number }`
  - `interface ColumnRow { id; board_id; title: string; col_order: number; is_done: boolean; wip_limit: number | null }`
  - `interface TaskRow { id; column_id; board_id; title: string; description: string | null; labels: string[]; priority: string; due_date: string | null; task_order: number; entered_column_at: string | null; subtasks: Subtask[] | null; assignee: string | null }`
  - `interface Rows { boards: BoardRow[]; columns: ColumnRow[]; tasks: TaskRow[] }`
  - `interface SyncPayload { upsert: Rows; remove: { boardIds: string[]; columnIds: string[]; taskIds: string[] } }`
  - `type RowSnapshot`, `EMPTY_SNAPSHOT`, `assembleBoards(rows: Rows): Board[]`, `flattenBoards(boards: Board[]): Rows`, `snapshotRows(rows: Rows): RowSnapshot`, `diffRows(prev: RowSnapshot, next: Rows): SyncPayload`, `isEmptyPayload(p): boolean`, `payloadSize(p): number`, `chunkPayload(p, maxRows?: number): SyncPayload[]`, `MAX_ROWS_PER_SYNC = 200`
  - `createSyncQueue(push: (p: SyncPayload) => Promise<void>, onFailedChange: (failed: boolean) => void): SyncQueue` với `SyncQueue { reset(snapshot: RowSnapshot): void; update(rows: Rows): Promise<void>; retry(): Promise<void> }`
  - `createDataApi(baseUrl: string | undefined, getToken: () => Promise<string | null>, fetchFn?: typeof fetch): DataApi` với `DataApi { load(): Promise<Rows>; sync(p: SyncPayload): Promise<void> }`

- [ ] **Step 1: Viết test thất bại cho `boardRows.ts`**

`src/board/boardRows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Board } from "../types";
import {
  assembleBoards,
  chunkPayload,
  diffRows,
  EMPTY_SNAPSHOT,
  flattenBoards,
  isEmptyPayload,
  payloadSize,
  snapshotRows,
} from "./boardRows";

const boards: Board[] = [
  {
    id: "b1",
    title: "Học AI",
    columns: [
      {
        id: "c1",
        title: "1. To Do",
        order: 0,
        isDone: false,
        wipLimit: 3,
        cards: [
          { id: "t1", title: "Đọc docs", labels: ["ui"], priority: "high", order: 0, dueDate: "2026-10-20", subtasks: [], assignee: "Dekyi" },
          { id: "t2", title: "Viết test", labels: [], priority: "low", order: 1, subtasks: [{ id: "s1", title: "x", isDone: true }] },
        ],
      },
      { id: "c2", title: "Done", order: 1, isDone: true, cards: [] },
    ],
  },
];

describe("assembleBoards / flattenBoards", () => {
  it("flatten rồi assemble ra lại đúng board ban đầu", () => {
    const back = assembleBoards(flattenBoards(boards));
    expect(back[0].columns[0].cards.map((c) => c.id)).toEqual(["t1", "t2"]);
    expect(back[0].columns[0].cards[0]).toMatchObject({ dueDate: "2026-10-20", assignee: "Dekyi", priority: "high" });
    expect(back[0].columns[0].cards[1].dueDate).toBeUndefined();
    expect(back[0].columns[1]).toMatchObject({ isDone: true, wipLimit: undefined });
  });

  it("flatten không gửi owner_id — Worker tự gán từ token", () => {
    expect(flattenBoards(boards).boards[0]).toEqual({ id: "b1", title: "Học AI", board_order: 0 });
  });
});

describe("diffRows", () => {
  it("từ snapshot rỗng ⇒ đẩy toàn bộ, không xóa gì", () => {
    const p = diffRows(EMPTY_SNAPSHOT, flattenBoards(boards));
    expect([p.upsert.boards.length, p.upsert.columns.length, p.upsert.tasks.length]).toEqual([1, 2, 2]);
    expect(p.remove).toEqual({ boardIds: [], columnIds: [], taskIds: [] });
  });

  it("không đổi gì ⇒ payload rỗng", () => {
    const rows = flattenBoards(boards);
    expect(isEmptyPayload(diffRows(snapshotRows(rows), rows))).toBe(true);
  });

  it("đổi tiêu đề 1 thẻ ⇒ chỉ gửi đúng thẻ đó", () => {
    const snap = snapshotRows(flattenBoards(boards));
    const changed = structuredClone(boards);
    changed[0].columns[0].cards[1].title = "Viết test kỹ";
    const p = diffRows(snap, flattenBoards(changed));
    expect(p.upsert.tasks.map((t) => t.id)).toEqual(["t2"]);
    expect(payloadSize(p)).toBe(1);
  });

  it("xóa thẻ ⇒ id nằm trong remove.taskIds", () => {
    const snap = snapshotRows(flattenBoards(boards));
    const changed = structuredClone(boards);
    changed[0].columns[0].cards.splice(0, 1);
    const p = diffRows(snap, flattenBoards(changed));
    expect(p.remove.taskIds).toEqual(["t1"]);
  });
});

describe("chunkPayload", () => {
  const tasks = Array.from({ length: 450 }, (_, i) => ({
    id: `t${i}`, column_id: "c1", board_id: "b1", title: "x", description: null, labels: [], priority: "low",
    due_date: null, task_order: i, entered_column_at: null, subtasks: [], assignee: null,
  }));
  const big = {
    upsert: { boards: [{ id: "b1", title: "B", board_order: 0 }], columns: [{ id: "c1", board_id: "b1", title: "C", col_order: 0, is_done: false, wip_limit: null }], tasks },
    remove: { boardIds: [], columnIds: [], taskIds: ["old1", "old2"] },
  };

  it("mỗi chunk tối đa 200 dòng và không mất dòng nào", () => {
    const chunks = chunkPayload(big);
    for (const c of chunks) expect(payloadSize(c)).toBeLessThanOrEqual(200);
    expect(chunks.reduce((n, c) => n + payloadSize(c), 0)).toBe(payloadSize(big));
  });

  it("xóa đi trước, board ghi SAU CÙNG (đứt giữa chừng thì lần tải sau vẫn chuyển lại)", () => {
    const chunks = chunkPayload(big);
    expect(chunks[0].remove.taskIds).toEqual(["old1", "old2"]);
    expect(chunks.slice(0, -1).every((c) => c.upsert.boards.length === 0)).toBe(true);
    expect(chunks.at(-1)!.upsert.boards.map((b) => b.id)).toEqual(["b1"]);
  });

  it("payload rỗng ⇒ không có chunk", () => {
    expect(chunkPayload(diffRows(EMPTY_SNAPSHOT, { boards: [], columns: [], tasks: [] }))).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy, xác nhận thất bại**

Run: `npx vitest run src/board/boardRows.test.ts`
Expected: FAIL — không resolve được `./boardRows`.

- [ ] **Step 3: Viết `src/board/boardRows.ts`**

Chuyển `BoardRow`/`ColumnRow`/`TaskRow`, `assembleBoards`, `flattenBoards` từ `BoardContext.tsx` sang đây (giữ nguyên logic gán field), bỏ `owner_id`, thêm snapshot/diff/chunk:

```ts
import type { Board, Card, Column, Priority, Subtask } from "../types";

/** Dạng dòng bảng — trùng tên cột với D1 (và Postgres cũ). Không có owner_id: Worker tự gán từ token. */
export interface BoardRow {
  id: string;
  title: string;
  board_order: number;
}

export interface ColumnRow {
  id: string;
  board_id: string;
  title: string;
  col_order: number;
  is_done: boolean;
  wip_limit: number | null;
}

export interface TaskRow {
  id: string;
  column_id: string;
  board_id: string;
  title: string;
  description: string | null;
  labels: string[];
  priority: string;
  due_date: string | null;
  task_order: number;
  entered_column_at: string | null;
  subtasks: Subtask[] | null;
  assignee: string | null;
}

export interface Rows {
  boards: BoardRow[];
  columns: ColumnRow[];
  tasks: TaskRow[];
}

export interface SyncPayload {
  upsert: Rows;
  remove: { boardIds: string[]; columnIds: string[]; taskIds: string[] };
}

/** Phải khớp MAX_ROWS_PER_SYNC trong worker/src/data.ts. */
export const MAX_ROWS_PER_SYNC = 200;

export function assembleBoards({ boards: boardRows, columns: columnRows, tasks: taskRows }: Rows): Board[] {
  const cardsByColumn = new Map<string, Card[]>();
  for (const t of taskRows) {
    const card: Card = {
      id: t.id,
      title: t.title,
      description: t.description ?? undefined,
      labels: t.labels ?? [],
      dueDate: t.due_date ?? undefined,
      priority: t.priority as Priority,
      order: t.task_order,
      enteredColumnAt: t.entered_column_at ?? undefined,
      subtasks: t.subtasks ?? [],
      assignee: t.assignee ?? undefined,
    };
    const list = cardsByColumn.get(t.column_id);
    if (list) list.push(card);
    else cardsByColumn.set(t.column_id, [card]);
  }
  for (const list of cardsByColumn.values()) list.sort((a, b) => a.order - b.order);

  const columnsByBoard = new Map<string, Column[]>();
  for (const c of columnRows) {
    const column: Column = {
      id: c.id,
      title: c.title,
      order: c.col_order,
      cards: cardsByColumn.get(c.id) ?? [],
      isDone: c.is_done,
      wipLimit: c.wip_limit ?? undefined,
    };
    const list = columnsByBoard.get(c.board_id);
    if (list) list.push(column);
    else columnsByBoard.set(c.board_id, [column]);
  }
  for (const list of columnsByBoard.values()) list.sort((a, b) => a.order - b.order);

  return boardRows
    .slice()
    .sort((a, b) => a.board_order - b.board_order)
    .map((b) => ({ id: b.id, title: b.title, columns: columnsByBoard.get(b.id) ?? [] }));
}

export function flattenBoards(boards: Board[]): Rows {
  const boardRows: BoardRow[] = boards.map((b, i) => ({ id: b.id, title: b.title, board_order: i }));
  const columnRows: ColumnRow[] = [];
  const taskRows: TaskRow[] = [];

  boards.forEach((b) => {
    b.columns.forEach((c, ci) => {
      columnRows.push({
        id: c.id,
        board_id: b.id,
        title: c.title,
        col_order: c.order ?? ci,
        is_done: c.isDone ?? false,
        wip_limit: c.wipLimit ?? null,
      });
      c.cards.forEach((card, cardi) => {
        taskRows.push({
          id: card.id,
          column_id: c.id,
          board_id: b.id,
          title: card.title,
          description: card.description ?? null,
          labels: card.labels ?? [],
          priority: card.priority,
          due_date: card.dueDate ?? null,
          task_order: card.order ?? cardi,
          entered_column_at: card.enteredColumnAt ?? null,
          subtasks: card.subtasks ?? [],
          assignee: card.assignee ?? null,
        });
      });
    });
  });

  return { boards: boardRows, columns: columnRows, tasks: taskRows };
}

/** id → JSON của dòng ở lần sync thành công gần nhất. So JSON là đủ vì flattenBoards luôn dựng key cùng thứ tự. */
export interface RowSnapshot {
  boards: ReadonlyMap<string, string>;
  columns: ReadonlyMap<string, string>;
  tasks: ReadonlyMap<string, string>;
}

export const EMPTY_SNAPSHOT: RowSnapshot = { boards: new Map(), columns: new Map(), tasks: new Map() };

export function snapshotRows(rows: Rows): RowSnapshot {
  const toMap = (list: { id: string }[]) => new Map(list.map((r) => [r.id, JSON.stringify(r)]));
  return { boards: toMap(rows.boards), columns: toMap(rows.columns), tasks: toMap(rows.tasks) };
}

function changed<T extends { id: string }>(prev: ReadonlyMap<string, string>, next: T[]): T[] {
  return next.filter((r) => prev.get(r.id) !== JSON.stringify(r));
}

function removed(prev: ReadonlyMap<string, string>, next: { id: string }[]): string[] {
  const keep = new Set(next.map((r) => r.id));
  return [...prev.keys()].filter((id) => !keep.has(id));
}

export function diffRows(prev: RowSnapshot, next: Rows): SyncPayload {
  return {
    upsert: {
      boards: changed(prev.boards, next.boards),
      columns: changed(prev.columns, next.columns),
      tasks: changed(prev.tasks, next.tasks),
    },
    remove: {
      boardIds: removed(prev.boards, next.boards),
      columnIds: removed(prev.columns, next.columns),
      taskIds: removed(prev.tasks, next.tasks),
    },
  };
}

export function payloadSize(p: SyncPayload): number {
  return (
    p.upsert.boards.length +
    p.upsert.columns.length +
    p.upsert.tasks.length +
    p.remove.boardIds.length +
    p.remove.columnIds.length +
    p.remove.taskIds.length
  );
}

export function isEmptyPayload(p: SyncPayload): boolean {
  return payloadSize(p) === 0;
}

type Item =
  | { kind: "taskId" | "columnId" | "boardId"; id: string }
  | { kind: "task"; row: TaskRow }
  | { kind: "column"; row: ColumnRow }
  | { kind: "board"; row: BoardRow };

/**
 * Chia payload thành các request ≤ maxRows dòng. Thứ tự cố ý: xóa trước, rồi
 * thẻ, cột, và board SAU CÙNG — nếu lần chuyển dữ liệu đầu tiên bị đứt giữa
 * chừng thì D1 vẫn "chưa có board", lần tải sau sẽ chuyển lại từ đầu (upsert
 * lặp lại vô hại) thay vì để lại một board thiếu thẻ.
 */
export function chunkPayload(p: SyncPayload, maxRows = MAX_ROWS_PER_SYNC): SyncPayload[] {
  const items: Item[] = [
    ...p.remove.taskIds.map((id) => ({ kind: "taskId" as const, id })),
    ...p.remove.columnIds.map((id) => ({ kind: "columnId" as const, id })),
    ...p.remove.boardIds.map((id) => ({ kind: "boardId" as const, id })),
    ...p.upsert.tasks.map((row) => ({ kind: "task" as const, row })),
    ...p.upsert.columns.map((row) => ({ kind: "column" as const, row })),
    ...p.upsert.boards.map((row) => ({ kind: "board" as const, row })),
  ];
  const chunks: SyncPayload[] = [];
  for (let i = 0; i < items.length; i += maxRows) {
    const c: SyncPayload = {
      upsert: { boards: [], columns: [], tasks: [] },
      remove: { boardIds: [], columnIds: [], taskIds: [] },
    };
    for (const it of items.slice(i, i + maxRows)) {
      if (it.kind === "taskId") c.remove.taskIds.push(it.id);
      else if (it.kind === "columnId") c.remove.columnIds.push(it.id);
      else if (it.kind === "boardId") c.remove.boardIds.push(it.id);
      else if (it.kind === "task") c.upsert.tasks.push(it.row);
      else if (it.kind === "column") c.upsert.columns.push(it.row);
      else c.upsert.boards.push(it.row);
    }
    chunks.push(c);
  }
  return chunks;
}
```

- [ ] **Step 4: Chạy test `boardRows`**

Run: `npx vitest run src/board/boardRows.test.ts` → Expected: 9 passed.

- [ ] **Step 5: Viết test thất bại cho `syncQueue.ts`**

`src/board/syncQueue.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Rows, SyncPayload } from "./boardRows";
import { snapshotRows } from "./boardRows";
import { createSyncQueue } from "./syncQueue";

function rows(title: string): Rows {
  return { boards: [{ id: "b1", title, board_order: 0 }], columns: [], tasks: [] };
}

describe("createSyncQueue", () => {
  it("lần đầu (snapshot rỗng) đẩy toàn bộ; lần sau không đổi thì không gửi", async () => {
    const push = vi.fn<(p: SyncPayload) => Promise<void>>().mockResolvedValue();
    const q = createSyncQueue(push, () => {});
    await q.update(rows("A"));
    await q.update(rows("A"));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0].upsert.boards[0].title).toBe("A");
  });

  it("reset bằng dữ liệu vừa tải ⇒ không gửi lại thứ đã có trên server", async () => {
    const push = vi.fn<(p: SyncPayload) => Promise<void>>().mockResolvedValue();
    const q = createSyncQueue(push, () => {});
    q.reset(snapshotRows(rows("A")));
    await q.update(rows("A"));
    expect(push).not.toHaveBeenCalled();
  });

  it("lỗi thì giữ snapshot cũ, báo failed; lần sau gửi lại rồi báo hết lỗi", async () => {
    const push = vi.fn<(p: SyncPayload) => Promise<void>>().mockRejectedValueOnce(new Error("500")).mockResolvedValue();
    const failed: boolean[] = [];
    const q = createSyncQueue(push, (f) => failed.push(f));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await q.update(rows("A"));
    await q.retry();
    expect(push).toHaveBeenCalledTimes(2);
    expect(push.mock.calls[1][0].upsert.boards[0].title).toBe("A");
    expect(failed).toEqual([true, false]);
    expect(spy).toHaveBeenCalledWith("Failed to sync boards to Cloudflare D1", expect.any(Error));
    spy.mockRestore();
  });

  it("thay đổi dồn dập trong lúc đang gửi ⇒ gộp thành đúng 1 lần gửi tiếp, mang bản mới nhất", async () => {
    let release!: () => void;
    const push = vi
      .fn<(p: SyncPayload) => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      .mockResolvedValue();
    const q = createSyncQueue(push, () => {});
    const first = q.update(rows("A"));
    void q.update(rows("B"));
    void q.update(rows("C"));
    release();
    await first;
    expect(push).toHaveBeenCalledTimes(2);
    expect(push.mock.calls[1][0].upsert.boards[0].title).toBe("C");
  });
});
```

- [ ] **Step 6: Chạy, xác nhận thất bại**

Run: `npx vitest run src/board/syncQueue.test.ts` → Expected: FAIL — không resolve được `./syncQueue`.

- [ ] **Step 7: Viết `src/board/syncQueue.ts`**

```ts
import {
  chunkPayload,
  diffRows,
  EMPTY_SNAPSHOT,
  isEmptyPayload,
  snapshotRows,
  type RowSnapshot,
  type Rows,
  type SyncPayload,
} from "./boardRows";

export interface SyncQueue {
  /** Đặt mốc "server đang có gì" (sau khi tải xong, hoặc EMPTY_SNAPSHOT khi cần đẩy toàn bộ). */
  reset(snapshot: RowSnapshot): void;
  /** Ghi nhận state mới nhất và sync phần chênh. Promise xong khi hết việc. */
  update(rows: Rows): Promise<void>;
  /** Thử gửi lại sau khi lỗi (nút "Thử lại"). */
  retry(): Promise<void>;
}

/**
 * Mỗi lúc chỉ một lượt gửi. Thay đổi đến trong lúc đang gửi được gộp lại và
 * gửi sau, luôn là bản mới nhất. Lỗi thì snapshot giữ nguyên ⇒ lần sau gửi lại
 * đủ phần chênh (upsert/xóa lặp lại là vô hại), và báo ra ngoài để UI hiện
 * "Chưa lưu được" — không im lặng như sync Supabase trước đây.
 */
export function createSyncQueue(
  push: (p: SyncPayload) => Promise<void>,
  onFailedChange: (failed: boolean) => void
): SyncQueue {
  let snapshot: RowSnapshot = EMPTY_SNAPSHOT;
  let latest: Rows | null = null;
  let dirty = false;
  let running: Promise<void> | null = null;

  async function pushOnce(): Promise<boolean> {
    const next = latest;
    if (!next) return true;
    const payload = diffRows(snapshot, next);
    if (isEmptyPayload(payload)) {
      onFailedChange(false);
      return true;
    }
    try {
      for (const chunk of chunkPayload(payload)) await push(chunk);
      snapshot = snapshotRows(next);
      onFailedChange(false);
      return true;
    } catch (err) {
      console.error("Failed to sync boards to Cloudflare D1", err);
      onFailedChange(true);
      return false;
    }
  }

  function flush(): Promise<void> {
    dirty = true;
    if (running) return running;
    running = (async () => {
      try {
        // Kiểm `dirty` và thoát vòng lặp không có await xen giữa, nên không có
        // khe hở để một update bị bỏ sót.
        while (dirty) {
          dirty = false;
          if (!(await pushOnce())) break;
        }
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    reset(s) {
      snapshot = s;
      latest = null;
      dirty = false;
    },
    update(rows) {
      latest = rows;
      return flush();
    },
    retry() {
      return flush();
    },
  };
}
```

- [ ] **Step 8: Chạy test `syncQueue`**

Run: `npx vitest run src/board/syncQueue.test.ts` → Expected: 4 passed.

- [ ] **Step 9: Viết test thất bại cho `dataApi.ts`**

`src/lib/dataApi.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createDataApi } from "./dataApi";

const emptyPayload = {
  upsert: { boards: [], columns: [], tasks: [] },
  remove: { boardIds: [], columnIds: [], taskIds: [] },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("createDataApi", () => {
  it("load: GET /data kèm Bearer token", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ boards: [], columns: [], tasks: [] }));
    const api = createDataApi("https://w.example.dev/", async () => "tok", fetchFn);
    expect(await api.load()).toEqual({ boards: [], columns: [], tasks: [] });
    expect(fetchFn).toHaveBeenCalledWith("https://w.example.dev/data", { headers: { Authorization: "Bearer tok" } });
  });

  it("sync: POST /data/sync với body JSON", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ ok: true }));
    const api = createDataApi("https://w.example.dev", async () => "tok", fetchFn);
    await api.sync(emptyPayload);
    expect(fetchFn).toHaveBeenCalledWith("https://w.example.dev/data/sync", {
      method: "POST",
      headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
      body: JSON.stringify(emptyPayload),
    });
  });

  it("lỗi từ Worker ⇒ reject kèm đúng câu lỗi của Worker", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ error: "upsert.tasks.0.due_date: phải là YYYY-MM-DD" }, 400));
    const api = createDataApi("https://w.example.dev", async () => "tok", fetchFn);
    await expect(api.sync(emptyPayload)).rejects.toThrow("400: upsert.tasks.0.due_date: phải là YYYY-MM-DD");
  });

  it("chưa đăng nhập ⇒ reject, không gọi mạng", async () => {
    const fetchFn = vi.fn();
    const api = createDataApi("https://w.example.dev", async () => null, fetchFn);
    await expect(api.load()).rejects.toThrow("Chưa đăng nhập");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("thiếu VITE_AGENT_WORKER_URL ⇒ reject với hướng dẫn", async () => {
    const api = createDataApi(undefined, async () => "tok", vi.fn());
    await expect(api.load()).rejects.toThrow("VITE_AGENT_WORKER_URL");
  });
});
```

- [ ] **Step 10: Chạy, xác nhận thất bại**

Run: `npx vitest run src/lib/dataApi.test.ts` → Expected: FAIL — không resolve được `./dataApi`.

- [ ] **Step 11: Viết `src/lib/dataApi.ts`**

```ts
import type { Rows, SyncPayload } from "../board/boardRows";

export interface DataApi {
  load(): Promise<Rows>;
  sync(payload: SyncPayload): Promise<void>;
}

/**
 * Gọi lớp dữ liệu trên Worker (cùng Worker với trợ lý AI, cùng biến
 * VITE_AGENT_WORKER_URL). Không import supabase ở đây để test chạy được mà
 * không cần biến môi trường — token được truyền vào qua getToken.
 */
export function createDataApi(
  baseUrl: string | undefined,
  getToken: () => Promise<string | null>,
  fetchFn: typeof fetch = (...args) => fetch(...args)
): DataApi {
  async function call(path: string, init: { method?: string; body?: string } = {}): Promise<unknown> {
    if (!baseUrl) throw new Error("Chưa cấu hình VITE_AGENT_WORKER_URL — không có nơi lưu dữ liệu.");
    const token = await getToken();
    if (!token) throw new Error("Chưa đăng nhập");
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetchFn(new URL(path, baseUrl).toString(), { ...init, headers });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(`${res.status}: ${body.error ?? res.statusText}`);
    return body;
  }

  return {
    async load() {
      return (await call("/data")) as Rows;
    },
    async sync(payload) {
      await call("/data/sync", { method: "POST", body: JSON.stringify(payload) });
    },
  };
}
```

Lưu ý test "load" mong đợi `fetchFn` được gọi với `{ headers }` (không có `method`/`body`): `{ ...init, headers }` với `init = {}` cho ra đúng `{ headers }`.

- [ ] **Step 12: Chạy toàn bộ test frontend**

Run: `npx vitest run src/board/boardRows.test.ts src/board/syncQueue.test.ts src/lib/dataApi.test.ts` → Expected: 18 passed.

- [ ] **Step 13: Commit**

```bash
git add src/board/boardRows.ts src/board/boardRows.test.ts src/board/syncQueue.ts src/board/syncQueue.test.ts src/lib/dataApi.ts src/lib/dataApi.test.ts
git commit -m "feat: row diffing, chunked sync queue and data API client for D1"
```

---

### Task 5: `BoardContext` dùng D1 + chuyển dữ liệu một lần từ Supabase

**Files:**
- Create: `src/lib/legacySupabase.ts`
- Create: `src/board/loadInitialBoards.ts`, `src/board/loadInitialBoards.test.ts`
- Modify: `src/board/BoardContext.tsx` (viết lại phần tải/sync, giữ nguyên `useBoard` và value của context)

**Interfaces:**
- Consumes: mọi thứ ở Task 4.
- Produces:
  - `loadSupabaseBoards(userId: string): Promise<Board[] | null>` — `null` = Supabase không có board; **ném lỗi** khi Supabase lỗi.
  - `loadInitialBoards(deps: { loadD1: () => Promise<Rows>; loadSupabase: () => Promise<Board[] | null>; loadLocal: () => Board[] | null; makeDefault: () => Board }): Promise<{ boards: Board[]; snapshot: RowSnapshot }>`
  - `BoardContext` value không đổi: `{ board, boards, dispatch }`.

- [ ] **Step 1: Viết test thất bại cho `loadInitialBoards`**

`src/board/loadInitialBoards.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Board } from "../types";
import { EMPTY_SNAPSHOT, flattenBoards } from "./boardRows";
import { loadInitialBoards } from "./loadInitialBoards";

const b = (id: string): Board => ({ id, title: id, columns: [] });
const emptyRows = { boards: [], columns: [], tasks: [] };

function deps(over: Partial<Parameters<typeof loadInitialBoards>[0]> = {}) {
  return {
    loadD1: vi.fn().mockResolvedValue(emptyRows),
    loadSupabase: vi.fn().mockResolvedValue(null),
    loadLocal: vi.fn().mockReturnValue(null),
    makeDefault: vi.fn().mockReturnValue(b("default")),
    ...over,
  };
}

describe("loadInitialBoards", () => {
  it("D1 có dữ liệu ⇒ dùng D1, không đụng tới Supabase, snapshot = dữ liệu đó", async () => {
    const d = deps({ loadD1: vi.fn().mockResolvedValue(flattenBoards([b("d1")])) });
    const r = await loadInitialBoards(d);
    expect(r.boards.map((x) => x.id)).toEqual(["d1"]);
    expect(r.snapshot.boards.has("d1")).toBe(true);
    expect(d.loadSupabase).not.toHaveBeenCalled();
  });

  it("D1 trống, Supabase có ⇒ dùng Supabase, snapshot rỗng để lần sync đầu đẩy hết lên D1", async () => {
    const r = await loadInitialBoards(deps({ loadSupabase: vi.fn().mockResolvedValue([b("old")]) }));
    expect(r.boards.map((x) => x.id)).toEqual(["old"]);
    expect(r.snapshot).toBe(EMPTY_SNAPSHOT);
  });

  it("cả hai trống ⇒ localStorage cũ, rồi mới tới board mặc định", async () => {
    expect((await loadInitialBoards(deps({ loadLocal: vi.fn().mockReturnValue([b("ls")]) }))).boards[0].id).toBe("ls");
    expect((await loadInitialBoards(deps())).boards[0].id).toBe("default");
  });

  it("Supabase LỖI ⇒ ném lỗi, KHÔNG tạo board mặc định (nếu không sẽ chặn luôn lần chuyển dữ liệu sau)", async () => {
    const d = deps({ loadSupabase: vi.fn().mockRejectedValue(new Error("supabase down")) });
    await expect(loadInitialBoards(d)).rejects.toThrow("supabase down");
    expect(d.makeDefault).not.toHaveBeenCalled();
  });

  it("D1 LỖI ⇒ ném lỗi, không đọc Supabase", async () => {
    const d = deps({ loadD1: vi.fn().mockRejectedValue(new Error("500")) });
    await expect(loadInitialBoards(d)).rejects.toThrow("500");
    expect(d.loadSupabase).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Chạy, xác nhận thất bại**

Run: `npx vitest run src/board/loadInitialBoards.test.ts` → Expected: FAIL — không resolve được `./loadInitialBoards`.

- [ ] **Step 3: Viết `src/board/loadInitialBoards.ts`**

```ts
import type { Board } from "../types";
import { assembleBoards, EMPTY_SNAPSHOT, flattenBoards, snapshotRows, type RowSnapshot, type Rows } from "./boardRows";

interface Deps {
  loadD1: () => Promise<Rows>;
  loadSupabase: () => Promise<Board[] | null>;
  loadLocal: () => Board[] | null;
  makeDefault: () => Board;
}

/**
 * Nguồn dữ liệu lúc mở app: D1 → (D1 chưa có board) Supabase cũ → localStorage
 * cũ → board mặc định. Lỗi ở bất kỳ bước đọc nào đều phải ném ra, không được
 * coi là "trống": coi nhầm thì board mặc định được ghi lên D1, D1 hết trống và
 * dữ liệu Supabase cũ sẽ không bao giờ được chuyển sang nữa.
 */
export async function loadInitialBoards(deps: Deps): Promise<{ boards: Board[]; snapshot: RowSnapshot }> {
  const rows = await deps.loadD1();
  if (rows.boards.length > 0) {
    const boards = assembleBoards(rows);
    return { boards, snapshot: snapshotRows(flattenBoards(boards)) };
  }
  const boards = (await deps.loadSupabase()) ?? deps.loadLocal() ?? [deps.makeDefault()];
  return { boards, snapshot: EMPTY_SNAPSHOT };
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run src/board/loadInitialBoards.test.ts` → Expected: 5 passed.

- [ ] **Step 5: Viết `src/lib/legacySupabase.ts`** (chép các câu query cũ từ `BoardContext.tsx`)

```ts
import type { Board } from "../types";
import { assembleBoards, type BoardRow, type ColumnRow, type TaskRow } from "../board/boardRows";
import { supabase } from "./supabaseClient";

/**
 * Giai đoạn 1 chuyển sang D1: chỉ ĐỌC dữ liệu cũ trên Supabase để chuyển một
 * lần. Không ghi/xóa gì ở Supabase — giữ nguyên làm bản dự phòng. Bỏ file này
 * ở giai đoạn 2 khi tắt hẳn Supabase.
 */
export async function loadSupabaseBoards(userId: string): Promise<Board[] | null> {
  const { data: boardRows, error } = await supabase
    .from("boards")
    .select("id, title, board_order")
    .eq("owner_id", userId);
  if (error) throw error;
  if (!boardRows || boardRows.length === 0) return null;

  const boardIds = boardRows.map((b) => b.id);
  const [columns, tasks] = await Promise.all([
    supabase.from("columns").select("id, board_id, title, col_order, is_done, wip_limit").in("board_id", boardIds),
    supabase
      .from("tasks")
      .select(
        "id, column_id, board_id, title, description, labels, priority, due_date, task_order, entered_column_at, subtasks, assignee"
      )
      .in("board_id", boardIds),
  ]);
  if (columns.error) throw columns.error;
  if (tasks.error) throw tasks.error;

  return assembleBoards({
    boards: boardRows as BoardRow[],
    columns: (columns.data ?? []) as ColumnRow[],
    tasks: (tasks.data ?? []) as TaskRow[],
  });
}
```

- [ ] **Step 6: Viết lại `src/board/BoardContext.tsx`**

Thay toàn bộ file bằng:

```tsx
import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import type { Board } from "../types";
import { appReducer, createDefaultAppState, migrateToAppState, type AppAction, type AppState } from "./appReducer";
import { createDefaultBoard } from "./boardReducer";
import { flattenBoards } from "./boardRows";
import { createSyncQueue } from "./syncQueue";
import { loadInitialBoards } from "./loadInitialBoards";
import { createDataApi } from "../lib/dataApi";
import { loadSupabaseBoards } from "../lib/legacySupabase";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";

interface BoardContextValue {
  board: Board;
  boards: Board[];
  dispatch: React.Dispatch<AppAction>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

// Dữ liệu board nằm trên Cloudflare D1, đọc/ghi qua Worker (cùng Worker với
// trợ lý AI). Đăng nhập vẫn là Supabase Auth — token của nó là thứ Worker dùng
// để biết dữ liệu thuộc về ai.
const dataApi = createDataApi(import.meta.env.VITE_AGENT_WORKER_URL as string | undefined, async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});

function readLegacyLocalStorageBoards(): Board[] | null {
  const raw = window.localStorage.getItem("kanban-board");
  if (!raw) return null;
  try {
    const state: AppState = migrateToAppState(JSON.parse(raw));
    return state.boards.length > 0 ? state.boards : null;
  } catch {
    return null;
  }
}

export function BoardProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(appReducer, null, createDefaultAppState);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const hydratingRef = useRef(true);
  // useState(() => ...) để hàng đợi chỉ tạo đúng 1 lần cho cả vòng đời provider.
  const [queue] = useState(() => createSyncQueue((p) => dataApi.sync(p), setSyncFailed));

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setReady(false);
    setLoadError(null);
    hydratingRef.current = true;

    (async () => {
      try {
        const { boards, snapshot } = await loadInitialBoards({
          loadD1: () => dataApi.load(),
          loadSupabase: () => loadSupabaseBoards(user.id),
          loadLocal: readLegacyLocalStorageBoards,
          makeDefault: createDefaultBoard,
        });
        if (cancelled) return;
        queue.reset(snapshot);
        dispatch({ type: "hydrate", boards, activeBoardId: boards[0].id });
        hydratingRef.current = false;
        setReady(true);
      } catch (err) {
        console.error("Failed to load boards", err);
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, queue]);

  useEffect(() => {
    if (!user || !ready || hydratingRef.current) return;
    void queue.update(flattenBoards(state.boards));
  }, [state, user, ready, queue]);

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-gray-600 dark:text-gray-300">
        <p>Không tải được dữ liệu board.</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{loadError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5"
        >
          Tải lại trang
        </button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
        Đang tải dữ liệu...
      </div>
    );
  }

  const activeBoard = state.boards.find((b) => b.id === state.activeBoardId) ?? state.boards[0];

  return (
    <BoardContext.Provider value={{ board: activeBoard, boards: state.boards, dispatch }}>
      {syncFailed && (
        // Màu trung tính có chủ ý: đỏ/cam/tím/xanh lá đã dành cho cảnh báo trên thẻ (xem CLAUDE.md).
        <div
          role="alert"
          className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-md bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 text-sm px-3 py-1.5 shadow"
        >
          <span>⚠ Chưa lưu được thay đổi lên máy chủ.</span>
          <button type="button" onClick={() => void queue.retry()} className="underline font-medium">
            Thử lại
          </button>
        </div>
      )}
      {children}
    </BoardContext.Provider>
  );
}

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used within a BoardProvider");
  return ctx;
}
```

- [ ] **Step 7: Build, lint, toàn bộ test**

Run: `npm run build` → Expected: thành công (tsc không báo lỗi).
Run: `npm run lint` → Expected: không lỗi mới.
Run: `npx vitest run` → Expected: tất cả pass (56 test cũ + test mới).
Run: `grep -rn "supabase.from" src` → Expected: chỉ còn trong `src/lib/legacySupabase.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/legacySupabase.ts src/board/loadInitialBoards.ts src/board/loadInitialBoards.test.ts src/board/BoardContext.tsx
git commit -m "feat: store boards in Cloudflare D1, migrating once from Supabase"
```

---

### Task 6: Kiểm thử end-to-end ở máy local

Không có file code mới. Mục tiêu: chạy app thật với Worker local + D1 local, đăng nhập thật, thấy dữ liệu Supabase được chuyển sang và thay đổi được lưu.

**Files:**
- Create (tạm, đã bị `.gitignore` chặn bởi `*.local`): `.env.development.local`
- Dùng: `.claude/launch.json` (tạo ở Task 3 Step 6)

- [ ] **Step 1: Trỏ frontend local tới Worker local**

`.env.development.local`:

```
VITE_AGENT_WORKER_URL=http://localhost:8787
```

- [ ] **Step 2: Khởi động** `worker` rồi `web` bằng preview tool.

- [ ] **Step 3: Người dùng đăng nhập Google trong pane trình duyệt** (Claude không nhập mật khẩu). `http://localhost:5173` đã có trong Redirect URLs của Supabase.

- [ ] **Step 4: Kiểm tra chuyển dữ liệu**

- Board cũ hiện đủ (so với bản production đang dùng Supabase).
- Network: 1 `GET /data` → 200; một hoặc vài `POST /data/sync` → 200.
- Run: `cd worker && npx wrangler d1 execute kanban-db --local --command "SELECT (SELECT count(*) FROM boards) b, (SELECT count(*) FROM columns) c, (SELECT count(*) FROM tasks) t"` → số khớp với số board/cột/thẻ trên màn hình.

- [ ] **Step 5: Kiểm tra lưu**

- Tạo thẻ, đổi tiêu đề, kéo sang cột khác, thêm subtask, xóa 1 thẻ (có hỏi xác nhận) → F5 → mọi thay đổi còn nguyên.
- Network sau mỗi thao tác: `POST /data/sync` với payload nhỏ (chỉ dòng thay đổi).
- Trợ lý AI 🤖: "thêm thẻ Test D1 vào cột đầu tiên" → thẻ xuất hiện → F5 → còn. (Cần `OPENAI_API_KEY` thật trong `worker/.dev.vars`; nếu không có, bỏ qua bước này ở local và kiểm ở Task 7.)

- [ ] **Step 6: Kiểm tra lỗi hiển thị đúng**

- Dừng preview `worker`, sửa 1 thẻ → băng "⚠ Chưa lưu được thay đổi lên máy chủ." hiện ra; Console có `Failed to sync boards to Cloudflare D1`.
- Bật lại `worker`, bấm "Thử lại" → băng biến mất → F5 → thay đổi còn.
- Console không có lỗi nào khác.

- [ ] **Step 7: Dọn dẹp**

Xóa `.env.development.local`. Không commit `.claude/launch.json` nếu người dùng không muốn (hỏi).

---

### Task 7: Deploy production + cập nhật CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Áp migration lên D1 thật**

Run: `cd worker && npx wrangler d1 migrations apply kanban-db --remote` → Expected: `0001_init.sql` ✅.

- [ ] **Step 2: Deploy Worker TRƯỚC**

Run: `cd worker && npx wrangler deploy`
Run: `curl -s -w " %{http_code}\n" <VITE_AGENT_WORKER_URL>/data` → Expected: `401`.
Run: `curl -s <VITE_AGENT_WORKER_URL>/models` → Expected: vẫn 4 model, `available: true`.

- [ ] **Step 3: Cập nhật CLAUDE.md**

- Mục **Backend / Auth**: dữ liệu board giờ ở D1 (`kanban-db`, binding `DB`), Worker là nơi duy nhất đọc/ghi; bảo mật thay RLS bằng `owner_id` từ token trong `worker/src/data.ts` (kèm test SQLite thật); Supabase chỉ còn Auth + bản dữ liệu cũ chỉ-đọc dùng cho lần chuyển đầu (`src/lib/legacySupabase.ts`); thêm cột mới = thêm file `worker/migrations/000N_*.sql` + `wrangler d1 migrations apply --remote` (thay cho cách chạy SQL tay trong Supabase SQL Editor).
- Mục **Lưu ý khi sửa code**: câu "Khi sync lỗi, UI vẫn hiện như đã thành công" → sửa thành: sync lỗi hiện băng "Chưa lưu được" + nút "Thử lại", Console ghi `Failed to sync boards to Cloudflare D1`; giới hạn D1 Free (100 tham số/câu, 50 truy vấn/lần gọi, 100k dòng ghi/ngày, chunk 200 dòng).
- Mục **Kiến trúc**: thêm `boardRows.ts`, `syncQueue.ts`, `loadInitialBoards.ts`, `src/lib/dataApi.ts`, `src/lib/legacySupabase.ts`, `worker/src/auth.ts`, `worker/src/data.ts`, `worker/migrations/`.
- Mục **Lịch sử**: thêm mục 14 "Chuyển dữ liệu board sang Cloudflare D1 (giai đoạn 1)", ghi rõ giai đoạn 2 (chuyển đăng nhập) chưa làm.
- Mục **Lệnh thường dùng**: thêm `npx wrangler d1 migrations apply kanban-db --remote` và `npx wrangler d1 execute kanban-db --remote --command "..."`.

- [ ] **Step 4: Commit + push frontend (hỏi người dùng trước khi push)**

```bash
git add CLAUDE.md
git commit -m "docs: record the move of board data to Cloudflare D1"
git push
```

- [ ] **Step 5: Xác nhận frontend đã lên**

Run: `npm run build && ls dist/assets/*.js` và `curl -s https://kanban-board-amc.pages.dev/ | grep -o 'index-[A-Za-z0-9_-]*\.js'` → tên bundle trùng nhau.

- [ ] **Step 6: Người dùng mở production, đăng nhập**

- Board hiện đủ như trước.
- Run: `cd worker && npx wrangler d1 execute kanban-db --remote --command "SELECT owner_id, count(*) FROM tasks GROUP BY owner_id"` → có dòng cho tài khoản vừa đăng nhập, số thẻ khớp.
- Sửa 1 thẻ → F5 → còn. Thử trợ lý AI 1 lệnh → F5 → còn.
- Nếu có tài khoản thứ hai (vd tài khoản test ở bài 9): đăng nhập, xác nhận chỉ thấy board của tài khoản đó.

**Rollback nếu có sự cố:** `git revert` commit của Task 5 rồi push → frontend quay về Supabase. Lưu ý: mọi thay đổi làm trong thời gian chạy D1 **không có** trên Supabase (Supabase đứng yên từ lúc chuyển). Worker mới vẫn tương thích frontend cũ (route agent không đổi), không cần rollback Worker.
