import type { Board } from "../types";
import { assembleBoards, type BoardRow, type ColumnRow, type TaskRow } from "../board/boardRows";
import { supabase } from "./supabaseClient";

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
