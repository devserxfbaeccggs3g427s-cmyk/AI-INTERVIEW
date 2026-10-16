# 01 — Requirements

Ứng dụng web luyện phỏng vấn bằng AI. Phạm vi sản phẩm được mô tả tại đây; kiến trúc ở [`02-DESIGN.md`](./02-DESIGN.md), công việc triển khai ở [`03-TASKS.md`](./03-TASKS.md). Đây là **ba file riêng**, không gộp.

## 1. Tổng quan

Ứng viên luyện trả lời phỏng vấn cho vị trí tự chọn và nhận góp ý, đánh giá cuối phiên. Họ tự cung cấp API key (BYOK) và chọn provider/model: Anthropic, OpenAI, Google Gemini hoặc endpoint tùy chỉnh tương thích OpenAI. Không cần tài khoản.

Phiên, transcript, CV đã trích, báo cáo đánh giá và cấu hình AI (trừ API key) được lưu ở **một cơ sở dữ liệu SQLite phía máy chủ** — cùng một file cho mọi người dùng, không đăng nhập. Hệ quả của việc này nằm ở **FR-18** và **NFR-10**.

## 2. Yêu cầu chức năng

### Cấu hình AI — màn hình riêng trước khi khởi tạo phiên

- **FR-12 — Cấu hình provider:** Chọn Anthropic / OpenAI / Google Gemini / Tuỳ chỉnh (OpenAI-compatible). Hiện trường base URL khi chọn Tuỳ chỉnh. Cho sửa cấu hình trước phiên mới; một phiên đang chạy giữ nguyên provider/model đã chọn.
- **FR-13 — BYOK:** Người dùng nhập, hiện/ẩn và xoá API key riêng. Server chỉ dùng key trong thời gian xử lý request, không lưu key ở server và không ghi key vào log. Giao diện thông báo rõ rằng key được lưu trong `localStorage` **dạng văn bản thuần**, ai có quyền truy cập cùng hồ sơ trình duyệt hoặc script chạy trên cùng origin đều có thể đọc. Có nút xoá key/cấu hình và lựa chọn không lưu key trên thiết bị (chỉ dùng trong tab hiện tại).
- **FR-14 — Model:** Người dùng chọn model từ danh sách khi provider hỗ trợ hoặc tự nhập ID model. Không khoá vào model mặc định; ID đã chọn được nhớ theo provider.
- **FR-15 — Custom endpoint:** Người dùng nhập base URL HTTPS của endpoint OpenAI-compatible và ID model. Endpoint tuỳ chỉnh không mặc nhiên hỗ trợ PDF, structured output, reasoning hay caching. Trong bản triển khai server công khai, URL trỏ vào mạng nội bộ/localhost hoặc địa chỉ không an toàn bị chặn; mô hình tự host trên localhost qua server proxy nằm ngoài phạm vi.
- **FR-16 — Danh sách model:** Có thao tác lấy danh sách model; nếu provider không cung cấp, không có quyền, hoặc lấy lỗi, hiển thị thông báo và vẫn cho nhập ID thủ công. Không ngầm khẳng định mọi model trong danh sách hỗ trợ đủ tính năng.

### Khởi tạo phiên — đúng năm lựa chọn

- **FR-1 — Thiết lập phỏng vấn:** (1) vị trí ứng tuyển nhập tự do 2–120 ký tự, có chip gợi ý điền nhanh; (2) ngôn ngữ Việt/Anh; (3) chế độ nghiêm khắc (không góp ý) hoặc kèm góp ý mỗi câu; (4) độ dài ngắn/vừa/dài tương ứng 5/8/12 câu; (5) nguồn CV. Cấu hình AI nằm ở **màn hình riêng**, không tính vào năm lựa chọn này.

### CV

- **FR-2 — Ba nguồn CV:** Không CV / dán văn bản / tải PDF. Với PDF, **người dùng tự chọn** đọc PDF trực tiếp bằng provider (chỉ khi adapter và model đã được xác nhận hỗ trợ) hoặc trích xuất text trước khi gửi. Nếu không hỗ trợ đọc trực tiếp, chỉ cho chọn trích text; không giả vờ PDF được đọc nguyên bản. Nếu trích text không ra nội dung, báo lỗi và cho dán văn bản hoặc bỏ CV. Giới hạn file, trang và nội dung theo thiết kế.
- **FR-3 — Dán văn bản:** Đưa nội dung CV vào ngữ cảnh, giới hạn 20.000 ký tự; không xem CV như chỉ thị điều khiển.
- **FR-4 — Không CV:** Phỏng vấn dựa trên vị trí ứng tuyển và lời người dùng mô tả.

### Hội thoại và đánh giá

- **FR-5 — Bắt đầu:** AI ra câu hỏi đầu tiên phù hợp vị trí và CV (nếu có), đúng ngôn ngữ; hiển thị dần theo dòng.
- **FR-6 — Trả lời:** Mỗi lượt nghiêm khắc chỉ hỏi tiếp; mỗi lượt kèm góp ý phản hồi ngắn rồi hỏi tiếp, hiển thị tách biệt. Dòng chữ đến dần.
- **FR-7 — Giới hạn lượt:** Kết thúc khi đạt số câu 5/8/12 theo lựa chọn.
- **FR-8 — Dừng sớm:** Có nút dừng từ câu đầu, báo cáo nêu rõ phiên chưa hoàn tất và không phạt vì chưa trả lời đủ.
- **FR-9 — Đánh giá:** Điểm từng câu cho nội dung, liên quan, rõ ràng, chiều sâu (0–100); điểm tổng, trích dẫn câu trả lời, nhận xét, điểm mạnh/yếu, 3–5 bước luyện tiếp, mức khuyến nghị. Báo cáo theo ngôn ngữ phiên.
- **FR-10 — Đầu vào dài:** Chặn câu trả lời hơn 4.000 ký tự trước khi gọi model.
- **FR-11 — Tải lại trang:** Phiên đang diễn ra và transcript không mất khi tải lại trang, khi đóng tab, hay khi mở lại ứng dụng ở máy khác — transcript đã ở máy chủ (FR-18), không nằm trong trình duyệt. API key **không** nằm trong bất kỳ dữ liệu nào lưu ở máy chủ, kể cả khi `persistKey` bật.
- **FR-17 — Báo cáo xuyên provider:** Đầu ra có cùng schema cho mọi provider. Dùng structured output khi đã xác nhận hỗ trợ; không thì yêu cầu JSON bằng prompt, parse và kiểm schema, thử sửa một lần nếu lỗi. Nếu vẫn lỗi, thông báo không tạo được báo cáo, không bịa điểm hay trả báo cáo thiếu trường.

### Lưu trữ — máy chủ giữ dữ liệu phiên

Nhóm này **thay thế** thiết kế "transcript do client giữ" của bản trước. Xem NFR-5 và FR-18.

- **FR-18 — Máy chủ giữ dữ liệu phiên:** Máy chủ lưu vào SQLite: phiên, lượt hội thoại (kèm `blocks` nguyên vẹn theo provider), CV đã trích thành văn bản, báo cáo đánh giá, và cấu hình AI **không kèm key**. Người dùng xem lại được các phiên cũ. **Không** đăng nhập ⇒ **mọi người dùng dùng chung một cơ sở dữ liệu và nhìn thấy dữ liệu của nhau** — mô hình này chỉ hợp với bản chạy một người (máy cá nhân, VPS riêng). Nếu bản triển khai là nhiều người dùng thì đây là hở, ghi thẳng chứ không giấu.
- **FR-19 — Xoá được dữ liệu của mình:** Có thao tác xoá một phiên và xoá toàn bộ dữ liệu người dùng khỏi máy chủ. Không yêu cầu hỗ trợ.
- **FR-20 — Đọc transcript từ máy chủ:** Client **không** gửi toàn bộ transcript mỗi lượt nữa; request mang `sessionId`, server tự nạp. Ở mọi provider, tiền tố gửi lên phải giống hệt byte so với bản client từng ghép — **không** hỏng vì đổi nơi ghép (NFR-7).

## 3. Phi chức năng

- **NFR-1 — Streaming:** Văn bản hiển thị dần; phản hồi kết thúc rõ thành công/lỗi.
- **NFR-2 — Bảo vệ key:** Không hardcode key, không đưa key vào query string, URL, log, telemetry hoặc thông báo lỗi; cấu hình lưu cục bộ là rủi ro được nêu rõ, không mô tả `localStorage` là kho bí mật an toàn. Chống XSS bằng escaping mặc định/CSP phù hợp; không đưa nội dung CV từ HTML chưa tin cậy vào DOM dưới dạng HTML thô.
- **NFR-3 — Lỗi:** Thông báo theo ngôn ngữ phiên, không lộ response thô chứa dữ liệu nhạy cảm; phân biệt key không hợp lệ, model không tồn tại/không có quyền, rate limit, lỗi tạm thời với lỗi request nội bộ.
- **NFR-4 — Chi phí:** Có giới hạn lượt/độ dài; ghi usage không chứa key, không hứa mức phí cố định trên mọi provider.
- **NFR-5 — Lưu trữ bền vững:** Dữ liệu phiên nằm ở **một file SQLite trên đĩa máy chủ**, tồn tại qua các lần khởi động lại. Hệ quả bắt buộc: **ứng dụng không chạy được trên nền tảng không có đĩa bền vững** (Vercel, Cloudflare Workers, serverless của AWS) — đó là hạn chế của mô hình, nêu thẳng thay vì ghi chung chung. Nền tảng đích là một instance Node có đĩa (VPS, Docker, Fly/Railway có volume). Dữ liệu tự host nằm trong volume phải được **backup**, không phụ thuộc gì vào chính ứng dụng.
- **NFR-6 — Cache:** Chỉ dùng tối ưu caching nơi thực sự hỗ trợ và đo được; không đòi cache-hit cho mọi provider.
- **NFR-7 — Ngữ cảnh:** Giữ transcript đầy đủ, không phá dữ liệu provider-specific cần cho lượt sau; thay provider/model giữa phiên phải bắt đầu phiên mới.
- **NFR-8 — SSRF:** Proxy server không được gọi custom base URL tới mạng nội bộ, loopback, metadata service hoặc đích đổi hướng tới đó; hạn chế DNS rebinding và redirect. Nếu chưa có outbound policy an toàn, không bật custom URL qua server khi triển khai công khai.
- **NFR-9 — Minh bạch năng lực:** Khi model không hỗ trợ PDF trực tiếp/structured output thì hạ cấp theo đường đã mô tả và thông báo; không cam kết suy luận/caching cho custom endpoint.
- **NFR-10 — API key không chạm SQLite:** Key chỉ tồn tại ở trình duyệt và trong header của request đang xử lý. **Không** có cột nào trong cơ sở dữ liệu chứa key, cũng không lưu cấu hình AI ở dạng đã phát tán rộng. Chỉ một bản sao trong RAM trong thời gian request.
- **NFR-11 — Không rò dữ liệu phiên khác:** Do FR-18 không có ranh giới người dùng, ứng dụng **không** thể đảm bảo người này không đọc phiên của người khác — đó là hệ quả của việc bỏ đăng nhập, ghi thẳng thay vì gắn nhãn "bảo mật". Bản đảm bảo được và phải nêu: **mọi lượt ghi xuống DB đều ghi thẳng nội dung người dùng**, nên log và `redact()` giữ nguyên nghĩa vụ NFR-2 với transcript, CV và báo cáo — không chỉ với key.
- **NFR-12 — Truy vấn phải chạy lúc request:** Driver SQLite là đồng bộ; Next 16 coi truy vấn đồng bộ là đã xong lúc prerender. Mọi lần đọc DB trong Server Component phải khai báo là IO runtime, nếu không `GET` bị đóng băng lúc build và trả dữ liệu rỗng mà không báo lỗi.

## 4. Ngoài phạm vi

Giọng nói/video, đăng nhập, chấm điểm để tuyển dụng thực, OCR ảnh/quét PDF, so sánh giá provider, truy cập endpoint localhost/tự host qua server công khai, cấu hình tham số suy luận chi tiết. Không tự động dùng chung key giữa các provider.

> Bản trước loại "lưu lịch sử trên server". Bản này **lưu** (FR-18). Đổi lại, những thứ sau bị loại vì không còn tự nhiên khi dữ liệu nằm trên server: đồng bộ hoá nhiều thiết bị bằng tài khoản, phân quyền người dùng, và chạy trên nền tảng không có đĩa bền vững.

## 5. Quyết định đã chốt

| Mục | Quyết định |
|---|---|
| Công nghệ | TypeScript + Next.js App Router |
| Provider | Anthropic, OpenAI, Google Gemini, custom OpenAI-compatible |
| Key | Người dùng tự nhập, lưu cục bộ khi đồng ý; chỉ gửi tới server của ứng dụng bằng HTTPS để server gọi provider; **không bao giờ ghi xuống SQLite** (NFR-10) |
| Lưu trữ | Một file SQLite trên đĩa máy chủ, driver `node:sqlite` của Node — không thêm dependency, không ORM, không build native module |
| Phạm vi lưu trữ | Phiên · transcript (kèm `blocks`) · CV đã trích · báo cáo đánh giá · cấu hình AI không kèm key |
| Nền tảng đích | Một instance Node có đĩa bền vững. **Không** phải nền tảng serverless không đĩa — xem NFR-5 |
| Ranh giới người dùng | **Không có** — không đăng nhập, một DB dùng chung (FR-18, NFR-11) |
| Cấu hình ở client | Chỉ API key và lựa chọn "không lưu key"; mọi thứ khác ở máy chủ |
| Model | Danh sách nếu có, luôn có đường nhập ID thủ công |
| CV PDF | Người dùng chọn đọc trực tiếp khi được xác nhận hỗ trợ hoặc trích text; các provider khác vẫn hỗ trợ trích text |
| Phạm vi bàn giao | Chỉ ba file requirements/design/tasks; chưa tạo mã nguồn |
