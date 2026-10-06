# Bài tập 9 — Nâng cấp Kanban với Backend & Đăng nhập

> Bản lưu trên máy của trang Notion: https://app.notion.com/p/3ef0c0e63cb381648689f98b82073054
> Phạm vi: chỉ giai đoạn chuyển backend sang Supabase (commit `783d9ea`), dừng trước khi deploy lên Cloudflare (bài 10).

App Kanban của Buổi 8 chuyển từ lưu trong trình duyệt (localStorage) sang **backend Supabase** và có **đăng nhập bằng Google**. Mỗi người đăng nhập chỉ thấy và sửa được board của chính mình.

## Backend đã dùng: Supabase (Postgres)
- **3 bảng quan hệ**: `boards` → `columns` → `tasks`, liên kết bằng khóa ngoại. Mỗi board có `owner_id` trỏ tới tài khoản người dùng (`auth.users`).
- **Phân quyền bằng Row Level Security (RLS)** trên cả 3 bảng: database chỉ cho đọc/ghi dữ liệu thuộc board mà người đang đăng nhập là chủ. Kể cả gọi thẳng API cũng bị chặn.
- **Chuyển dữ liệu cũ tự động**: lần đầu đăng nhập, board trong trình duyệt (từ bài 8) được tự đẩy lên Supabase.
- **Không lộ thông tin nhạy cảm**: khóa Supabase nằm trong `.env` (đã `.gitignore`). Frontend chỉ dùng khóa *anon*, an toàn nhờ RLS. Client Secret của Google chỉ nằm trên Supabase.

## Cách đăng nhập: Google OAuth qua Supabase Auth
- Màn hình đăng nhập chặn toàn bộ app.
- Bấm "Đăng nhập với Google" → chọn tài khoản → quay lại app với board của riêng mình; góc phải hiện tên, ảnh đại diện, nút Đăng xuất.

## Quy trình đưa backend lên Supabase
1. **Yêu cầu:** "tôi muốn chuyển backend của app này qua Supabase". AI hỏi lại để chốt yêu cầu trước khi làm.
2. **Tạo project Supabase** (Free, Singapore), **tạo bảng, bật RLS** với 4 policy theo `auth.uid() = owner_id`. AI chạy công cụ kiểm tra bảo mật của Supabase và sửa cảnh báo tìm thấy.
3. **Mình tự làm phần Google:** tạo project trên Google Cloud, cấu hình màn hình đồng ý OAuth, tạo OAuth Client, dán Client ID / Secret vào Supabase. Chỗ nào chưa rõ (quota, parent resource, "Try for free") đều hỏi trước khi bấm.
4. **Nối app với Supabase:** cài `@supabase/supabase-js`, ghi khóa vào `.env`, thêm màn hình đăng nhập/đăng xuất, viết lại phần lưu dữ liệu. Test 28/28 + build trước khi thử.
5. **Thử đăng nhập trên máy** (`localhost`) — chạy đúng. Hỏi lại "RLS đã bật chưa?", AI kiểm tra trực tiếp trên database.
6. **Sửa thiết kế database theo chuẩn quan hệ** (bên dưới), rồi test lại toàn bộ.

## Mình đã chỉ huy AI thế nào — điều tâm đắc nhất
Tạo task trong app nhưng mở Supabase không thấy bảng task nào: thiết kế đầu tiên của AI gộp toàn bộ cột và thẻ vào một ô JSON trong `boards`. Mình so với database Thầy hướng dẫn và yêu cầu làm lại theo mô hình quan hệ. AI nói rõ làm *y hệt* Thầy thì mất tính năng (thêm/đổi tên cột, WIP). Chốt cách giữ đủ tính năng nhưng tách 3 bảng `boards` → `columns` → `tasks`; chuyển toàn bộ task cũ sang bảng mới, kiểm tra khớp số liệu rồi mới xóa cột JSON cũ (migration `drop_legacy_boards_columns_jsonb`).

Bài học: app chạy được chưa có nghĩa là làm đúng — người chỉ huy phải tự mở "phía sau" ra kiểm tra và đối chiếu với chuẩn.

## Đã kiểm tra hệ thống thế nào
- 28/28 test đạt, build không lỗi (chạy lại trên đúng commit `783d9ea`).
- Đăng nhập 2 tài khoản Google (Dao, Antonio): mỗi tài khoản chỉ thấy board của mình.
- Tấn công chéo tài khoản: Antonio cố đọc/sửa/xóa/ghi vào board của Dao và tạo board đứng tên Dao → tất cả bị chặn. Đối chứng: Antonio đọc board của mình bình thường.
- Chưa đăng nhập: đọc 3 bảng = 0 dòng, ghi bị chặn.
- Kéo "Đặt lịch khám răng cho bé" sang In Progress, tải lại trang → vẫn ở đó; truy vấn Supabase xác nhận cột "2. In Progress".
- Console không có lỗi đồng bộ.

## Ảnh
1. `01-man-hinh-dang-nhap.png` — Màn hình đăng nhập Google
2. `02-tai-khoan-dao-board.png` — Tài khoản Dao: board "Kế hoạch tuần"
3. `03-chi-tiet-the.png` — Chi tiết thẻ
4. `04-tai-khoan-dao-danh-sach-board.png` — Danh sách board của Dao
5. `05-sau-keo-tha-va-tai-lai.png` — Sau kéo thả + tải lại, dữ liệu đọc từ Supabase
6. `06-tai-khoan-antonio-board.png` — Tài khoản Antonio: board "Việc nhà"
7. `07-tai-khoan-antonio-danh-sach-board.png` — Danh sách board của Antonio, không có board của Dao
8. `08-ket-qua-kiem-tra-phan-quyen.png` — Bảng kết quả 10 lần kiểm tra phân quyền
9. `09-dark-mode.png` — Dark mode
10. `10-supabase-dashboard.png` — Supabase dashboard (đã làm mờ URL project)
11. `11-supabase-schema.png` — Sơ đồ 3 bảng
