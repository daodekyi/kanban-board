# Bài tập 8 — Hoàn thiện ứng dụng Kanban bằng Agentic Engineering

Ứng dụng Kanban chạy local trên trình duyệt (`npm run dev` → http://localhost:5173), không cần backend hay tài khoản. Dữ liệu lưu ngay trong trình duyệt (localStorage), tải lại trang không mất.

Công nghệ: Vite + React + TypeScript + Tailwind CSS, kéo thả bằng dnd-kit, hiệu ứng bằng framer-motion, test bằng Vitest.

---

## 1. Quy trình Agentic Engineering đã áp dụng

Mình không bảo AI "viết app Kanban" một lần rồi nhận kết quả. Mình làm việc với Claude Code theo 4 bước, mỗi bước có sản phẩm để mình duyệt trước khi qua bước sau:

1. **Brainstorm → Design spec.** AI hỏi lại mình từng câu để chốt yêu cầu (phong cách giao diện, thẻ cần những thông tin gì, có cần nhiều board không...). Kết quả được ghi thành file thiết kế `docs/superpowers/specs/2026-08-17-kanban-app-design.md`: mô hình dữ liệu, các thành phần giao diện, cách xử lý lỗi, và **những gì cố ý chưa làm** (để tránh làm lan man).
2. **Spec → Kế hoạch triển khai.** Từ spec, AI lập kế hoạch 6 bước nhỏ (`docs/superpowers/plans/2026-08-17-kanban-app.md`): khung dự án → kiểu dữ liệu + logic xử lý → lưu trữ → thẻ → cột + kéo thả → hoàn thiện. Mỗi bước ghi rõ file nào, làm gì, kiểm tra thế nào.
3. **Thực thi từng bước, viết test trước (TDD).** Phần logic quan trọng nhất (thêm/sửa/xóa/di chuyển thẻ và cột) được viết test trước, chạy cho thấy test hỏng, rồi mới viết code cho test chạy đúng. Mỗi bước xong là một commit riêng trên Git, nên có thể xem lại hoặc quay lui bất cứ lúc nào.
4. **Dùng thử → góp ý → sửa.** Sau khi bản cơ bản chạy, mình dùng thử trên trình duyệt, thấy chỗ nào chưa tiện thì yêu cầu thêm/sửa từng việc nhỏ. Mỗi thay đổi lại đi qua vòng: sửa → chạy test → xem trên trình duyệt → commit.

Toàn bộ quá trình nằm trong **26 commit** trên Git, từ "viết design spec" đến bản hoàn chỉnh.

## 2. Tính năng

**Bản cơ bản (theo spec):**
- Tạo / đổi tên / xóa cột; tạo / sửa / xóa thẻ
- Kéo thả thẻ giữa các cột và đổi thứ tự trong cùng cột
- Chi tiết thẻ: mô tả, nhãn màu, hạn chót, độ ưu tiên (Thấp / Trung bình / Cao)
- Tự động lưu, tải lại trang vẫn còn nguyên

**Phần mình thêm / cải tiến sau khi dùng thử:**
- **Cột Review** giữa In Progress và Done, cột đánh số 1–4 bằng huy hiệu tròn cho dễ nhìn
- **Thanh tiến độ tổng thể**: bao nhiêu thẻ đã xong / tổng số (%)
- **Giới hạn WIP** cho mỗi cột (vd In Progress tối đa 3 thẻ) — nhắc mình không ôm quá nhiều việc cùng lúc
- **Cảnh báo hạn chót**: "Còn 3 ngày", "Hết hạn hôm nay"
- **Cycle time**: thẻ nằm ở một cột quá lâu sẽ hiện "⏱ 6 ngày" để biết việc nào đang bị kẹt
- **Đánh giá khi hoàn thành**: thẻ vào cột Done hiện "Sớm 3 ngày" / "Đúng hạn" / "Trễ 2 ngày" so với hạn chót
- **Tìm kiếm thẻ** theo tiêu đề hoặc mô tả, mỗi cột hiện số thẻ khớp (vd 1/3)
- **Nhiều board độc lập** (vd một board việc nhà, một board học tập), đổi tên / xóa / tạo mới ngay trên tiêu đề
- **Dark mode**
- **Hiệu ứng** khi thêm / xóa thẻ, **hỏi xác nhận trước khi xóa thẻ**

**Lỗi đã phát hiện và sửa khi dùng thử:**
- Nút "+ Thêm thẻ" bị đẩy xuống tận đáy cột → sửa cho nằm ngay dưới thẻ cuối cùng
- Cột trống không nhận thẻ khi kéo vào (vùng thả bị co lại) → sửa cho cột trống vẫn nhận thả trên toàn bộ chiều cao

## 3. Đã kiểm tra những gì trước khi hoàn tất

- **Test tự động:** 27 test (Vitest) cho logic board, logic quản lý nhiều board và phần lưu trữ — **27/27 đạt**.
- **Kiểm tra kiểu dữ liệu và build:** `npm run build` (TypeScript strict) không lỗi.
- **Kiểm tra bằng tay trên trình duyệt**, theo đúng danh sách luồng trong spec: thêm/sửa/xóa cột, thêm/sửa/xóa thẻ, kéo thả giữa các cột và trong cùng cột, sửa chi tiết thẻ, tìm kiếm, đổi board, bật/tắt dark mode, và **tải lại trang để xác nhận dữ liệu vẫn còn**.

## 4. Ảnh chụp ứng dụng đang chạy

1. `01-board-tong-quan.png` — Board 4 cột với thanh tiến độ, giới hạn WIP (3/3 tối đa), cảnh báo hạn chót, cycle time, đánh giá Sớm/Đúng hạn/Trễ ở cột Done
2. `02-chi-tiet-the.png` — Cửa sổ sửa chi tiết thẻ: mô tả, nhãn màu, hạn chót, độ ưu tiên
3. `03-tim-kiem.png` — Tìm kiếm "test": chỉ còn thẻ khớp, mỗi cột hiện số thẻ khớp / tổng
4. `04-nhieu-board.png` — Danh sách board để chuyển đổi, đổi tên, xóa, tạo board mới
5. `06-sau-khi-keo-tha.png` — Sau khi kéo thẻ "Viết blog về Kanban" từ To Do sang Review
6. `07-dark-mode.png` — Dark mode, chụp **sau khi tải lại trang**: thẻ vừa kéo vẫn nằm ở Review
