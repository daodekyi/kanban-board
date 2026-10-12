import type { Board } from "../types";
import { assembleBoards, type BoardRow, type ColumnRow, type TaskRow } from "../board/boardRows";
import { supabase } from "./supabaseClient";

// PostgREST mặc định chỉ trả tối đa 1000 dòng mỗi lần select và KHÔNG báo lỗi. Sau khi chuyển
// sang D1 thì D1 là nguồn sự thật, nên dòng nào bị cắt ở đây sẽ biến mất vĩnh viễn. Vì vậy
// đọc thiếu thì dừng hẳn (màn hình lỗi tải, không ghi gì lên D1) còn hơn mất thẻ âm thầm.
function assertReadAll(table: string, got: number, expected: number | null): void {
  if (expected !== null && got < expected) {
    throw new Error(
      `Dữ liệu cũ trên Supabase có ${expected} dòng ${table} nhưng chỉ đọc được ${got} — dừng chuyển dữ liệu để không mất thẻ.`
    );
  }
}

/**
 * Giai đoạn 1 chuyển sang D1: chỉ ĐỌC dữ liệu cũ trên Supabase để chuyển một
 * lần. Không ghi/xóa gì ở Supabase — giữ nguyên làm bản dự phòng. Bỏ file này
 * ở giai đoạn 2 khi tắt hẳn Supabase.
 */
export async function loadSupabaseBoards(userId: string): Promise<Board[] | null> {
  // Dưới RLS, request không có phiên trả về [] chứ không báo lỗi. Nếu coi đó là "user không có
  // board" thì app sẽ ghi board mặc định lên D1 và chặn vĩnh viễn việc chuyển dữ liệu cũ.
  // Vì vậy phải chắc chắn có phiên đúng user trước khi tin kết quả rỗng.
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session || sessionData.session.user.id !== userId) {
    throw new Error("Phiên đăng nhập Supabase không hợp lệ — không đọc được dữ liệu cũ để chuyển sang.");
  }

  const { data: boardRows, error, count: boardCount } = await supabase
    .from("boards")
    .select("id, title, board_order", { count: "exact" })
    .eq("owner_id", userId);
  if (error) throw error;
  if (!boardRows || boardRows.length === 0) return null;
  assertReadAll("boards", boardRows.length, boardCount);

  const boardIds = boardRows.map((b) => b.id);
  const [columns, tasks] = await Promise.all([
    supabase.from("columns").select("id, board_id, title, col_order, is_done, wip_limit", { count: "exact" }).in("board_id", boardIds),
    supabase
      .from("tasks")
      .select(
        "id, column_id, board_id, title, description, labels, priority, due_date, task_order, entered_column_at, subtasks, assignee",
        { count: "exact" }
      )
      .in("board_id", boardIds),
  ]);
  if (columns.error) throw columns.error;
  if (tasks.error) throw tasks.error;
  assertReadAll("columns", columns.data?.length ?? 0, columns.count);
  assertReadAll("tasks", tasks.data?.length ?? 0, tasks.count);

  return assembleBoards({
    boards: boardRows as BoardRow[],
    columns: (columns.data ?? []) as ColumnRow[],
    tasks: (tasks.data ?? []) as TaskRow[],
  });
}
