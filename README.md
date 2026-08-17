# Kanban

Ứng dụng Kanban board chạy hoàn toàn trên trình duyệt (không backend). Xây dựng bằng Vite + React + TypeScript + Tailwind CSS, kéo thả bằng dnd-kit, dữ liệu lưu trong localStorage.

## Chạy dự án

```bash
npm install
npm run dev
```

Mở URL được in ra (mặc định http://localhost:5173).

## Kiểm thử

```bash
npx vitest run
```

## Tính năng

- Tạo/sửa/xóa cột và thẻ
- Kéo thả thẻ giữa các cột và trong cùng cột
- Chi tiết thẻ: mô tả, nhãn màu, hạn chót, độ ưu tiên
- Dữ liệu tự động lưu vào localStorage
