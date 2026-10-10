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
