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
