# Những gì app Kanban đã cải tiến ở bài 11 (so với bài 10)

| # | Cải tiến | Trước (bài 10) | Bây giờ (bài 11) | Vì sao có ích |
|---|---|---|---|---|
| 1 | **Trợ lý AI ngay trong app** | Chỉ thao tác bằng tay | Nút 🤖: ra lệnh tiếng Việt → Agent đọc, tạo, sửa, di chuyển task | Làm nhanh nhiều việc trong một câu |
| 2 | **Nói thay vì gõ** | — | Nút micro tròn màu cam. Nói xong, chữ hiện vào ô để **xem lại rồi mới gửi** | Rảnh tay; nghe nhầm cũng không tự làm sai board |
| 3 | **Chọn 4 model AI** | — | GPT, Gemini, Claude, DeepSeek. Đổi ngay trong khung chat | So sánh được; đổi model không phải deploy lại app |
| 4 | **Xóa luôn phải xác nhận** | Xóa tay có hỏi | Cả lệnh xóa của Agent (thẻ, cột, board) cũng hiện khung đỏ, chưa bấm Xóa thì không mất gì | Agent không thể tự ý xóa dữ liệu |
| 5 | **Hoàn tác Ctrl+Z** | Xóa là mất | Ctrl+Z gỡ lại thao tác. Mọi việc Agent làm trong một câu = một bước hoàn tác | Lỡ tay vẫn cứu được |
| 6 | **Nhiều bước trong một câu** | — | "Tạo board Du lịch với 4 cột và thêm 3 việc" → làm hết một lần | Đỡ phải ra lệnh từng bước |
| 7 | **Agent biết hôm nay là ngày nào** | — | "Hạn ngày mai" → đổi đúng ra ngày cụ thể (đã thử: ra 12/10/2026) | Đặt hạn tự nhiên như nói chuyện |
| 8 | **Không đoán bừa** | — | Thiếu thông tin thì hỏi lại ("vào cột nào?") | Không tạo thẻ sai chỗ |
| 9 | **Kiểm lại mọi thao tác của Agent** | — | App loại thao tác trỏ tới thẻ/cột không có thật, ngày sai định dạng, và báo rõ | Chặn Agent "ảo giác" |
| 10 | **Nhãn model nói thật** | — | DeepSeek ghi rõ "thử nghiệm, kém ổn định (7/16)" sau khi đo | Người dùng biết chọn model nào |
| 11 | **Lịch sử chat còn sau khi F5** | — | Lưu theo từng tài khoản, nút "Dọn" để xóa | Không mất ngữ cảnh khi tải lại |
| 12 | **Dữ liệu board chuyển sang Cloudflare D1** | Supabase lo cả dữ liệu lẫn đăng nhập | Board/cột/thẻ lưu trên D1 qua Worker; mỗi tài khoản chỉ thấy dữ liệu của mình. Nếu lưu lỗi, app hiện băng "Chưa lưu được thay đổi" kèm lý do và nút "Thử lại" (đã thử thật bằng cách tắt mạng — ảnh 19, 20). **Đăng nhập Google vẫn qua Supabase Auth** (giai đoạn 2 mới chuyển) | Dữ liệu và Agent cùng nằm trên Cloudflare. Trước đây lưu lỗi thì app không báo gì, người dùng tưởng đã lưu; giờ thì biết ngay để bấm Thử lại |
| 13 | **Thanh đo Context** | — | Đầu khung chat hiện cuộc chat đang chiếm bao nhiêu "bộ nhớ" của model (vd "16.801 / 1.050.000 token"); đổi màu cam khi đầy 75%, đỏ khi đầy 90%; nút "Dọn" để giải phóng | Thấy được cuộc chat dài cỡ nào so với giới hạn của model; dọn bớt khi cần |

**Bảo mật giữ nguyên nguyên tắc:** khóa API của cả 4 model và giọng nói chỉ nằm trong Cloudflare Worker (`wrangler secret`), không bao giờ xuống trình duyệt. Đã quét file JavaScript đang chạy online: không có khóa nào.
