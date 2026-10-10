# Bài tập 10 — Đưa app Kanban lên Internet

> Bản lưu trên máy của trang Notion: https://app.notion.com/p/3f20c0e63cb381259ee0c3d0ba3a57ab
> Phạm vi: từ sau khi chuyển backend sang Supabase (bài 9) tới khi app chạy online và đăng nhập được. Dừng trước bài 11.

**Link app online (bản bài 10):** https://a5588b31.kanban-board-amc.pages.dev

## App deploy ở đâu
- **Cloudflare Pages**.
- Luồng tự động **GitHub → Cloudflare**: code nằm ở repo GitHub riêng tư `daodekyi/kanban-board`. Mỗi lần push lên nhánh `master`, Cloudflare tự build (`npm run build`) và đưa thư mục `dist` lên mạng.

## Backend đang dùng
- **Supabase**: database Postgres (3 bảng `boards` → `columns` → `tasks`, bật Row Level Security) và đăng nhập Google (Supabase Auth).
- App chạy trên trình duyệt và gọi thẳng Supabase. Mỗi người chỉ đọc/ghi được board của chính mình, kể cả khi gọi thẳng API.

## Quy trình deploy
1. **Bàn trước khi làm.** Mình nói "deploy app này lên Cloudflare, hãy bàn với tôi trước". AI đề xuất đẩy thẳng từ máy bằng lệnh `wrangler`. Mình chọn cách khác: **đưa lên GitHub trước, để GitHub tự deploy sang Cloudflare**, vì như vậy mỗi lần sửa code chỉ cần push.
2. **Kiểm bảo mật trước khi push.** Mình yêu cầu AI kiểm. Kết quả: file `.env` chưa từng lọt vào Git (quét cả lịch sử), không có khóa nào viết cứng trong code, `.env.example` chỉ có tên biến, repo để chế độ riêng tư.
3. **Mình tự nối Cloudflare với GitHub** trên Cloudflare Dashboard (Workers & Pages → Create → Pages → Connect to Git → chọn repo). Bước cấp quyền này phải tự bấm.
4. **Sửa 3 lỗi sau lần deploy đầu** (bảng bên dưới).
5. **Dọn code chẩn đoán**, push lên GitHub → Cloudflare tự deploy bản mới. Từ đó mỗi commit là một bản deploy (ảnh 9).

## Ba lỗi đã gặp và cách sửa
| Triệu chứng | Nguyên nhân gốc | Cách sửa |
|---|---|---|
| Trang trắng trơn | Lúc tạo project, *Framework preset* để "None", ô Build command và Build output trống → Cloudflare không build, chỉ đưa code thô lên | Chọn preset **Vite**: build `npm run build`, output `dist` → Retry deployment |
| Vẫn trắng, dù build báo "Success" | 2 biến `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` chỉ nằm trong `.env` trên máy (không lên Git). Vite gắn biến **lúc build**, nên bản build trên Cloudflare thiếu biến và app dừng ngay khi mở | Khai 2 biến trong Cloudflare (Settings → Variables and secrets) → build lại. Ba dòng `5b6f87c` liền nhau ở ảnh 9 chính là các lần build lại này |
| Đăng nhập Google xong lại quay về màn hình đăng nhập | Supabase chưa biết địa chỉ mới, vẫn trả về `localhost:3000` mặc định | Supabase → Authentication → URL Configuration: đổi Site URL sang địa chỉ online, thêm Redirect URL (giữ `http://localhost:5173/**` để vẫn chạy được trên máy) |

## Mình đã chỉ huy AI thế nào — điều tâm đắc nhất
Build báo **"Success"** mà trang vẫn trắng. Mình học được: **"build thành công" không có nghĩa là "app chạy được"**. Bước build chỉ kiểm code có dịch được không, không kiểm app có đủ "chìa khóa" để mở database không.

Mình không đoán mò. Mình đối chiếu: trên máy (`localhost`) đăng nhập chạy tốt, chỉ bản online bị lỗi. Như vậy lỗi nằm ở **chỗ khác nhau giữa máy mình và Cloudflare**, không nằm ở code. AI mở console của trang online, thấy đúng câu báo thiếu 2 biến môi trường.

Mình cũng giữ nguyên tắc bảo mật: khóa *anon* của Supabase để ở Cloudflare là an toàn (vốn dành cho trình duyệt, được RLS bảo vệ). Khóa *secret / service_role* thì tuyệt đối không dùng cho frontend. Sửa xong, mình bảo AI dọn hết dòng log chẩn đoán trước khi push, để bản chạy thật không còn "đồ nghề sửa chữa".

## Đã kiểm tra những gì sau khi deploy
- **Mở app online:** hiện màn hình "Đăng nhập với Google" (ảnh 1).
- **Đăng nhập Google trên bản online**, đăng nhập xong quay về đúng địa chỉ online (ảnh 2). Đã thử 2 tài khoản Google khác nhau (Dao, Antonio): mỗi tài khoản chỉ thấy board của mình.
- **Tạo board, thêm thẻ, sửa chi tiết thẻ trên bản online** (ảnh 2, 3, 7): board "Deploy lên Cloudflare" và "Học AI QA" tạo ngay trên bản online.
- **Dữ liệu lưu thật:** kéo thẻ "Quét khóa bí mật trong bản online" từ Review sang Done, tải lại trang → thẻ vẫn ở Done (ảnh 5).
- **Luồng tự động:** Cloudflare ghi "Automatic deployments enabled"; mỗi commit trên GitHub có một bản deploy tương ứng, build thành công ✓ (ảnh 9).
- **Không lộ khóa bí mật** (kiểm ngày 7·10·2026): quét file JavaScript đang chạy online, không có khóa OpenAI / Google / Anthropic / secret Supabase. Khóa Supabase duy nhất trong file là loại `anon`.
- **Tải lại ở đường dẫn con** vẫn mở được app, không bị lỗi 404.

## Phần nâng cao đã làm: GitHub → Deploy tự động
- **Mỗi lần push là một lần deploy, không bấm tay.** Cloudflare ghi "Automatic deployments enabled"; mỗi commit có đúng một bản deploy, build thành công ✓ (ảnh 9).
- **Đã thử luồng bằng thay đổi thật:** dọn code chẩn đoán rồi push lên GitHub → Cloudflare tự build và đưa bản mới lên.
- **Có sẵn một cổng kiểm tra:** lệnh build là `tsc -b && vite build`. Code sai kiểu dữ liệu thì build hỏng, Cloudflare không deploy, bản đang chạy giữ nguyên.

## Để Thầy đăng nhập kiểm tra
- Mở https://a5588b31.kanban-board-amc.pages.dev → "Đăng nhập với Google" bằng **bất kỳ tài khoản Google nào**. App đã chuyển sang **In production** trên Google Auth Platform (có trang chính sách riêng tư https://kanban-board-amc.pages.dev/privacy.html), nên không cần thêm tài khoản vào danh sách thử nghiệm.
- Lần đầu đăng nhập, app tự tạo một board riêng cho tài khoản đó. Thầy không thấy dữ liệu của mình và ngược lại (đúng thiết kế phân quyền).

## Ảnh
1. `01-man-hinh-dang-nhap-online.png` — Màn hình đăng nhập của app online
2. `02-board-deploy-len-cloudflare.png` — Board "Deploy lên Cloudflare": mỗi thẻ là một bước của bài này
3. `03-chi-tiet-the.png` — Chi tiết thẻ: mô tả, người phụ trách, nhãn, hạn chót, việc con
4. `04-danh-sach-board.png` — Danh sách board
5. `05-sau-keo-tha-va-tai-lai.png` — Kéo thẻ sang Done, tải lại trang vẫn còn
6. `06-board-ke-hoach-tuan.png` — Board "Kế hoạch tuần"
7. `07-board-hoc-ai-qa.png` — Board "Học AI QA"
8. `08-dark-mode.png` — Dark mode
9. `09-cloudflare-deployments.png` — Cloudflare: "Automatic deployments enabled", mỗi bản deploy gắn với 1 commit
10. `10-cloudflare-build-settings.png` — Cloudflare: Build `npm run build` · output `dist` · 2 biến Supabase (đã làm mờ giá trị)
11. `11-supabase-redirect-urls.png` — Supabase: các địa chỉ được phép quay về sau khi đăng nhập
12. `12-github-repo-readme.png` — GitHub (repo riêng tư) ở phiên bản bài 10: README, tính năng (đã che ngày)
