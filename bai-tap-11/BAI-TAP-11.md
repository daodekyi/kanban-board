# Bài tập 11 — Đưa AI Agent vào app Kanban

> Bản trên Notion: https://app.notion.com/p/3f70c0e63cb3814baf80e1f22599d2d9 (có thêm bảng "So với bài 10" — xem `CAI-TIEN.md`)

> Phạm vi: Agent nằm ngay trong app Kanban đang chạy online (bài 10). Người dùng ra lệnh bằng tiếng Việt, gõ hoặc nói, Agent thao tác thật trên dữ liệu.

**Link app online:** https://kanban-board-amc.pages.dev
(Đăng nhập bằng bất kỳ tài khoản Google nào, bấm nút 🤖 ở góc dưới bên phải để mở Trợ lý.)

## Agent làm được những gì
**Yêu cầu tối thiểu (đã kiểm trên bản online):**
- **Đọc task:** "Cột To Do có những thẻ nào?", "Thẻ nào đang ở In Progress, giao cho ai, hạn khi nào?" → trả lời, không sửa gì (ảnh 2).
- **Tạo task:** tạo thẻ kèm đủ thuộc tính trong một câu: ưu tiên, người phụ trách, hạn chót, việc con (ảnh 3).
- **Sửa task:** "Đổi ưu tiên **thẻ đó** thành trung bình và đánh dấu xong việc con…" — Agent nhớ "thẻ đó" là thẻ vừa nói tới (ảnh 4).
- **Di chuyển task:** "Chuyển thẻ đó sang In Progress" (ảnh 5).
- **Xóa phải chờ xác nhận:** lệnh xóa thẻ, xóa cột, xóa board đều hiện khung đỏ "Xác nhận xóa". Chưa bấm **Xóa** thì không có gì bị xóa; bấm **Hủy** thì giữ nguyên (ảnh 6, 7, 9). Ô nhập bị khóa trong lúc chờ, để gõ "ok" không bị hiểu nhầm thành lệnh mới.

**Tính năng thêm, mang bản sắc riêng của app:**
1. **Nói thay vì gõ** — bấm nút micro, nói lệnh, bấm dừng. Chữ hiện vào ô nhập để mình **xem lại rồi mới gửi**, nên một câu nghe nhầm không bao giờ tự biến thành thao tác trên board. Nhận dạng tiếng Việt lẫn tên cột tiếng Anh ("To Do", "Review"), và dùng tên thẻ/người phụ trách trên board làm từ khóa để viết đúng chính tả tên riêng.
2. **Chọn 1 trong 4 model AI** — GPT-5.6 Luna, Gemini 3.5 Flash Lite, Claude Sonnet 5, DeepSeek V4 Flash (ảnh 13). Mình đã **đo** 4 model bằng cùng một bộ 16 test case (bảng bên dưới).
3. **Hoàn tác Ctrl+Z** — mọi việc Agent làm trong một câu trả lời là **một bước hoàn tác**. Lỡ xóa vẫn khôi phục được (ảnh 8).
4. **Nhiều bước trong một câu** — "Tạo board Demo Agent với 4 cột mặc định, rồi thêm 3 thẻ vào To Do…" → Agent làm hết trong một lần (ảnh 1).
5. **Biết hôm nay là ngày nào** — "hạn ngày mai" được đổi đúng thành ngày cụ thể theo giờ máy người dùng.
6. **Không đoán bừa** — câu thiếu thông tin ("Thêm một thẻ mới") thì Agent hỏi lại tên thẻ và cột, không tự tạo (ảnh 10).

## Model và framework đã dùng
- **Framework:** OpenAI Agents SDK (`@openai/agents`) chạy trên **Cloudflare Worker**.
- **Model:** 4 model chọn được ngay trong khung chat. Danh sách model và id thật chỉ nằm ở Worker, nên đổi model không cần deploy lại app.
- **Giọng nói:** model `gpt-transcribe` của OpenAI (nhận đoạn ghi âm, trả về chữ).
- **Ép định dạng:** Agent phải trả về đúng một schema (Zod) gồm câu trả lời + danh sách thao tác. Riêng Claude đi qua API gốc của Anthropic bằng *tool use*, vì đường tương thích OpenAI của Anthropic từ chối schema lớn của app.

## Cách tích hợp: Agent SDK — và vì sao chọn cách này
**Luồng:** khung chat (trình duyệt) → Cloudflare Worker (giữ khóa API, gọi Agent SDK) → Agent trả về *danh sách thao tác* → app **kiểm lại từng thao tác** → chạy qua đúng bộ xử lý mà thao tác tay đang dùng → lưu lên Cloudflare D1.

**Vì sao Agent SDK, không phải API thuần hay Managed Agent:**
- **Không phải API thuần:** Agent SDK lo sẵn phần ép đầu ra theo schema và đổi model. Một schema duy nhất dùng chung cho cả 4 model, sửa một chỗ là cả 4 đi theo.
- **Không phải Managed Agent:** Agent của mình không cần máy ảo riêng hay chạy dài. Việc của nó là "dịch" câu tiếng Việt thành thao tác trên board, còn **app là nơi duy nhất ghi dữ liệu**. Nhờ vậy mọi thao tác của Agent đều đi qua cùng lớp kiểm tra và cùng khung xác nhận xóa như người dùng bấm tay — không có đường ghi dữ liệu thứ hai.
- **Vì sao cần Worker:** app chạy trên trình duyệt, mọi biến trong code frontend ai cũng xem được. Khóa API nằm trong Worker (`wrangler secret`), Worker chỉ phục vụ người đã đăng nhập Google.

**Không tin mù quáng Agent:** app loại bỏ thao tác trỏ tới thẻ/cột/board không có thật, ngày sai định dạng, giá trị vô nghĩa, và báo rõ thao tác nào bị loại.

## Kết quả kiểm thử
### 1. Test trên app online thật (11·10·2026)
| Mã | Yêu cầu | Lệnh | Kết quả |
|---|---|---|---|
| TC-01 | Tạo nhiều bước | Tạo board Demo Agent + 4 cột + 3 thẻ | ✅ 5,5 giây |
| TC-02 | Đọc task | "Cột To Do có những thẻ nào?" | ✅ đúng, không sửa gì |
| TC-03 | Tạo task | Thẻ "Kiểm thử trợ lý AI": ưu tiên cao, giao Lan, hạn ngày mai, 2 việc con | ✅ hạn = 12/10 (đúng ngày mai) |
| TC-04 | Sửa task | "Đổi ưu tiên thẻ đó… đánh dấu xong việc con" | ✅ hiểu "thẻ đó" |
| TC-05 | Di chuyển | "Chuyển thẻ đó sang In Progress" | ✅ |
| TC-06 | Xóa → Hủy | "Xóa thẻ Họp review với team" → Hủy | ✅ hiện xác nhận, thẻ còn nguyên |
| TC-07 | Xóa → Xóa | Như trên → bấm Xóa | ✅ chỉ xóa sau khi bấm |
| TC-08 | Hoàn tác | Ctrl+Z | ✅ thẻ quay lại |
| TC-09 | Xóa board | "Xóa board Demo Agent" → Hủy | ✅ hiện xác nhận, board còn |
| TC-10 | Không đoán bừa | "Thêm một thẻ mới" | ✅ hỏi lại, không tạo |
| TC-11 | Lưu thật | Tải lại trang | ✅ dữ liệu còn đủ (kể cả thẻ vừa khôi phục) |
| TC-12 | Giọng nói (máy) | Gửi đoạn ghi âm webm/opus (đúng định dạng nút micro ghi) | ✅ ra đúng câu sau 1,7 giây |
| TC-12b | Giọng nói (người thật) | Mình bấm micro và nói tiếng Việt: *"Bạn hãy tạo một job tên là thi đấu cờ vua do Đào quản lý và làm xong trước ngày 15 tháng 10"* | ✅ ra chữ đúng, có dấu. Agent hỏi lại "vào cột nào?", mình trả lời "cột To Do" → tạo thẻ, giao Đào, hạn 15/10/2026. Nhờ "tạo các subtask cho job này" → Agent hỏi lại cụ thể, rồi đề xuất 4 việc con (ảnh 14, 15) |
| TC-12d | Giọng nói × 4 model | Mình nói tiếng Việt với GPT, Gemini, Claude, DeepSeek | ✅ cả 4 model làm đúng lệnh (ảnh 17) |
| TC-12c | Thu âm không rõ | Lần nói đầu quá nhỏ/ngắn | ✅ báo "Mình không nghe rõ. Bạn nói lại gần micro hơn nhé", không gửi bừa |
| TC-13 | Không lộ khóa | Quét file JavaScript đang chạy online | ✅ không có khóa OpenAI/Gemini/Anthropic/OpenRouter/secret Supabase |

Cùng bộ đọc → tạo → sửa → di chuyển → xóa có xác nhận, chạy lại cho 3 model còn lại: **Gemini ✅, Claude ✅** (3–4 giây/lệnh). **DeepSeek ❌**: lệnh nào cũng hỏi lại "board nào?", có lệnh mất 48 giây (ảnh 12).

### 2. So sánh 4 model bằng bộ đánh giá tự động (16 test case)
| Model | Đạt | Thời gian TB |
|---|---|---|
| GPT-5.6 Luna | 16/16 | 2,7 giây |
| Claude Sonnet 5 | 16/16 | 2,2 giây |
| Gemini 3.5 Flash Lite | 12/16 | 1,6 giây |
| DeepSeek V4 Flash | 7/16 | 12,8 giây |

Bộ test gồm cả các "bẫy mất dữ liệu" (sửa 1 field mà không được đụng field khác), thao tác ở board khác, câu mơ hồ, thẻ không tồn tại. DeepSeek nhiều lần gửi nhầm lệnh *xóa board* thay vì sửa thẻ — **khung xác nhận xóa chặn được hết**, không mất dữ liệu nào. Đây chính là lý do mình bắt buộc xác nhận ở tầng app, không trông vào việc model "ngoan".

**Vì sao vẫn giữ DeepSeek:** mình cố ý giữ cả 4 model để người dùng tự so sánh, và **ghi thẳng trên nhãn**: *"DeepSeek V4 Flash · thử nghiệm, kém ổn định (7/16)"* (ảnh 13). Mình không tin chất lượng model nào chỉ vì nó có tên tuổi — đo rồi mới nói, và nói thật kết quả.

## Điều mình học được
> *(Bản nháp — bạn đọc lại và sửa theo đúng suy nghĩ của mình.)*
- **"Chạy được" phải đo, không đoán.** Bốn model cùng nhận một câu lệnh nhưng kết quả chênh nhau rất xa: 16/16 so với 7/16. Không có bộ test thì mình đã tưởng model nào cũng như nhau.
- **An toàn đặt ở app, không đặt ở model.** Model có lúc gửi nhầm lệnh xóa. Vì app luôn bắt xác nhận và kiểm lại từng thao tác, lỗi của model không thành mất dữ liệu.
- **Lỗi của file test khác lỗi của app.** Lúc thử giọng nói, Worker báo lỗi. Đọc log mới thấy OpenAI từ chối *file mẫu* (WAV 8-bit), còn nút 🎤 ghi định dạng webm thì chạy tốt. Đọc log thật trước khi kết luận.

## Để Thầy kiểm tra
1. Mở https://kanban-board-amc.pages.dev → "Đăng nhập với Google" (tài khoản nào cũng được).
2. Bấm 🤖 góc dưới phải. Thử: *"Tạo board Du lịch với 4 cột mặc định và thêm 3 việc cần chuẩn bị"*, *"Chuyển thẻ đầu tiên sang In Progress"*, *"Xóa board Du lịch"*.
3. Bấm nút micro cạnh nút Gửi để nói lệnh (trình duyệt sẽ hỏi quyền micro), bấm ■ khi nói xong, xem lại chữ rồi bấm Gửi.
4. Đổi model ở ô **MODEL** đầu khung chat.

## Ảnh
1. `01-tao-board-demo-agent.png` — Một câu: tạo board + 4 cột + 3 thẻ
2. `02-doc-task.png` — Đọc task
3. `03-tao-task-day-du.png` — Tạo thẻ đủ thuộc tính
4. `04-sua-task.png` — Sửa "thẻ đó"
5. `05-di-chuyen-task.png` — Di chuyển thẻ
6. `06-xoa-cho-xac-nhan.png` — Lệnh xóa hiện khung xác nhận
7. `07-da-xoa.png` — Chỉ xóa sau khi bấm Xóa
8. `08-hoan-tac-ctrl-z.png` — Ctrl+Z khôi phục thẻ
9. `09-xoa-board-cho-xac-nhan.png` — Xóa board cũng phải xác nhận
10. `10-thieu-thong-tin-hoi-lai.png` — Thiếu thông tin thì hỏi lại
11. `11-sau-tai-lai-van-con.png` — Tải lại trang, dữ liệu còn nguyên
12. `12-gemini-xac-nhan-xoa.png`, `12-claude-xac-nhan-xoa.png`, `12-deepseek-hoi-lai-board.png` — 3 model còn lại
13. `13-chon-4-model.png` — Chọn model
14. `14-giong-noi-that-1.png` — Mình ra lệnh bằng giọng nói tiếng Việt, Agent hỏi lại cột rồi tạo thẻ
15. `15-the-tao-bang-giong-noi.png` — Thẻ "Thi đấu cờ vua" tạo bằng giọng nói: giao Đào, hạn 15/10, 4 việc con
16. `16-nut-micro.png` — Nút micro cạnh nút Gửi
