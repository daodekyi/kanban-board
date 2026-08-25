# Kanban

Ứng dụng Kanban board chạy trên trình duyệt. Xây dựng bằng Vite + React + TypeScript + Tailwind CSS, kéo thả bằng dnd-kit, animation bằng framer-motion. Backend: Supabase (Postgres + Google OAuth), deploy tại [kanban-board-amc.pages.dev](https://kanban-board-amc.pages.dev) qua Cloudflare Pages.

## Chạy dự án

```bash
npm install
npm run dev
```

Mở URL được in ra (mặc định http://localhost:5173). Cần đăng nhập Google để xem board — yêu cầu file `.env` với `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` (xem `.env.example`).

## Kiểm thử

```bash
npx vitest run
```

## Tính năng

- Tạo/sửa/xóa cột và thẻ, kéo thả thẻ giữa các cột và trong cùng cột
- Chi tiết thẻ: mô tả, nhãn màu, hạn chót, độ ưu tiên, người phụ trách, checklist việc con
- WIP limit theo cột, cột đánh dấu hoàn thành, cycle time và cảnh báo thẻ kẹt lâu
- Tìm kiếm và lọc thẻ theo người phụ trách
- Nhiều board độc lập, board switcher, dark mode
- Đăng nhập Google (Supabase Auth), dữ liệu đồng bộ qua Supabase (Postgres)

Xem [CLAUDE.md](CLAUDE.md) để biết chi tiết kiến trúc, quy ước code, và lịch sử phát triển.
