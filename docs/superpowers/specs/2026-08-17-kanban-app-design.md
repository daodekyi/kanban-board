# Kanban App — Design Spec

Date: 2026-08-17

## Mục tiêu
Xây dựng ứng dụng Kanban web chạy hoàn toàn phía client (không backend), phong cách hiện đại/tối giản kiểu Trello/Linear, hỗ trợ kéo thả thẻ giữa các cột, và chi tiết thẻ gồm mô tả, nhãn màu, hạn chót, độ ưu tiên.

## Tech stack
- Vite + React + TypeScript
- Tailwind CSS cho styling
- `@dnd-kit/core` + `@dnd-kit/sortable` cho kéo thả
- State lưu trong `localStorage`, không có backend/database
- Không cần đăng nhập, một board mặc định cho người dùng

## Mô hình dữ liệu

```ts
type Priority = "low" | "medium" | "high";

interface Card {
  id: string;
  title: string;
  description?: string;
  labels: string[];       // màu nhãn, vd ["#f87171", "#60a5fa"]
  dueDate?: string;        // ISO date
  priority: Priority;
  order: number;
}

interface Column {
  id: string;
  title: string;
  order: number;
  cards: Card[];
}

interface Board {
  id: string;
  title: string;
  columns: Column[];
}
```

Dữ liệu board được serialize toàn bộ vào `localStorage` dưới key `kanban-board`. Không cần multi-board trong phạm vi này (YAGNI theo lựa chọn "Cơ bản + chi tiết thẻ").

## Kiến trúc thành phần

- `App` — load/save state qua `useLocalStorage`, cung cấp `BoardContext`.
- `Board` — layout ngang các `Column`, bọc `DndContext` (dnd-kit) xử lý kéo thẻ giữa/trong cột, nút "Thêm cột".
- `Column` — header (tên inline-editable, số lượng thẻ, nút xóa cột), danh sách `SortableContext` chứa `Card`, nút "Thêm thẻ".
- `Card` — hiển thị tiêu đề, chip nhãn màu, badge độ ưu tiên (màu theo mức), hạn chót (đỏ nếu quá hạn), click mở `CardModal`.
- `CardModal` — form sửa: tiêu đề, mô tả (textarea), chọn nhãn màu (multi-select chip), hạn chót (date input), độ ưu tiên (select), nút Lưu/Xóa/Đóng.

State quản lý qua React Context + `useReducer` (actions: addColumn, removeColumn, renameColumn, addCard, updateCard, removeCard, moveCard, reorderColumn). Mỗi action tự động persist vào localStorage qua effect.

## Luồng dữ liệu
1. App khởi động → đọc `localStorage`; nếu trống, seed 3 cột mặc định (To Do, In Progress, Done).
2. Mọi thao tác (thêm/sửa/xóa/kéo thả) dispatch action → reducer cập nhật state → effect ghi lại localStorage.
3. Kéo thả dùng dnd-kit: `onDragEnd` tính toán cột đích + vị trí mới, dispatch `moveCard`.

## Xử lý lỗi / edge case
- Xóa cột có thẻ → xác nhận trước khi xóa (window.confirm đơn giản).
- Card không có hạn chót/nhãn vẫn hiển thị bình thường (ẩn phần tương ứng).
- localStorage lỗi/parse fail → fallback về seed mặc định, không crash app.

## Kiểm thử
- Không dùng framework test phức tạp cho scope này; kiểm thử thủ công qua trình duyệt (dev server) theo các luồng: thêm/sửa/xóa cột, thêm/sửa/xóa thẻ, kéo thả giữa cột, kéo thả trong cùng cột, sửa chi tiết thẻ (nhãn/hạn chót/ưu tiên), reload để kiểm tra persist.
- Nếu thời gian cho phép, thêm vài unit test cho reducer (logic thuần, dễ test) bằng Vitest.

## Ngoài phạm vi (out of scope)
- Nhiều board, tìm kiếm/lọc, xuất/nhập dữ liệu, đăng nhập/đồng bộ multi-device — có thể làm sau nếu cần.
