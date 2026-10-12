TÓM TẮT BÀI 11 — AI AGENT TRONG APP KANBAN

| Mục | Nội dung |
|---|---|
| Agent làm được gì | Đọc, tạo, sửa, di chuyển task bằng tiếng Việt, GÕ hoặc NÓI (nút micro). Tạo board + cột + thẻ trong một câu. Hiểu "thẻ đó". Thiếu thông tin thì hỏi lại. |
| Hành động nguy hiểm | Xóa thẻ / cột / board LUÔN hiện khung xác nhận. Chưa bấm Xóa thì không mất gì. Lỡ tay vẫn Ctrl+Z khôi phục được. |
| Model / framework | OpenAI Agents SDK trên Cloudflare Worker (GPT, Gemini, DeepSeek); riêng Claude gọi API gốc Anthropic, dùng chung một schema. Chọn 4 model trong khung chat: GPT-5.6 Luna, Claude Sonnet 5, Gemini 3.5 Flash Lite, DeepSeek V4 Flash. Giọng nói: gpt-transcribe. |
| Cách tích hợp và lý do | Agent SDK: một schema đầu ra dùng chung cho cả 4 model, đổi model không phải viết lại code. Không cần Managed Agent vì Agent chỉ "dịch" câu nói thành thao tác; app là nơi duy nhất ghi dữ liệu, nên mọi lệnh của Agent đi qua cùng lớp kiểm tra và khung xác nhận xóa như khi bấm tay. |
| Bảo mật | Khóa API chỉ nằm trong Worker, không xuống trình duyệt. Đã quét file JavaScript online: không có khóa nào. |
| So với bài 10 | Bài 10 chưa có Agent. Bài 11 thêm: trợ lý AI, giọng nói, 4 model, Ctrl+Z, nhiều bước trong một câu, biết ngày hôm nay, dữ liệu board chuyển sang Cloudflare D1 (đăng nhập Google vẫn qua Supabase). |

KẾT QUẢ TEST 4 MODEL (16 test case, cùng đề, chỉ khác model)

| Model | Đạt | Tốc độ TB |
|---|---|---|
| GPT-5.6 Luna | 16/16 | 2,7 giây |
| Claude Sonnet 5 | 16/16 | 2,2 giây |
| Gemini 3.5 Flash Lite | 12/16 | 1,6 giây (nhanh nhất) |
| DeepSeek V4 Flash | 7/16 | 12,8 giây (chậm nhất) |

Thêm 16 test trên app online thật (đọc, tạo, sửa, di chuyển, xóa thẻ/cột/board → Hủy, xóa → Xóa, Ctrl+Z, tải lại trang, giọng nói thật, tắt mạng → app báo "Chưa lưu được" → bấm Thử lại → đã lưu): đạt hết với GPT; Gemini và Claude đạt bộ rút gọn. Ra lệnh bằng giọng nói tiếng Việt: cả 4 model làm đúng. DeepSeek lúc được lúc không — lần mình gõ lệnh thì câu nào nó cũng hỏi lại "board nào?", lần nói thì làm đúng.

MÌNH CHỈ HUY AI THẾ NÀO — ĐIỀU TÂM ĐẮC NHẤT
Mình không tin model nào chỉ vì tên tuổi: cho cả 4 con làm cùng một bộ đề rồi chấm điểm. DeepSeek chỉ 7/16 và hay gửi nhầm lệnh xóa board. Trong app, mọi lệnh xóa (thẻ, cột, board) đều bị giữ ở khung xác nhận — mình đã thử thật — nên lệnh nhầm không tự thành mất dữ liệu. Mình vẫn giữ DeepSeek và ghi thẳng trên nhãn "thử nghiệm, kém ổn định (7/16)". An toàn phải nằm ở app, không trông vào việc model "ngoan".

Chi tiết + ảnh: https://app.notion.com/p/3f70c0e63cb3814baf80e1f22599d2d9
