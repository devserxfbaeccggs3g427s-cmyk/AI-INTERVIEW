# 01 — REQUIREMENTS: AI MOCK INTERVIEW STUDIO (BYOK & SELF-HOSTED SQLITE)

Tài liệu đặc tả yêu cầu chức năng (FR) và phi chức năng (NFR) cho ứng dụng Web luyện phỏng vấn AI với triết lý Bring Your Own Key (BYOK) và lưu trữ SQLite Server-side.

---

### 1. TỔNG QUAN HỆ THỐNG
* **Mục tiêu**: Nền tảng web cho phép ứng viên luyện trả lời phỏng vấn theo vị trí tự chọn và nhận báo cáo đánh giá chi tiết, chuyên sâu sau phiên phỏng vấn.
* **Mô hình BYOK**: Người dùng tự cung cấp API Key (Anthropic, OpenAI, Google Gemini, hoặc endpoint tương thích OpenAI). Không yêu cầu đăng ký/đăng nhập.
* **Lưu trữ Server-side**: Một file SQLite duy nhất trên máy chủ lưu trữ phiên, transcript hội thoại kèm raw blocks, CV trích xuất, báo cáo đánh giá và cấu hình model (hoàn toàn KHÔNG lưu API key).
* **Đặc tính single-tenant / local / VPS**: Không phân quyền tài khoản, mọi người dùng trên cùng instance truy cập cùng dữ liệu (FR-18, NFR-10, NFR-11).

---

### 2. YÊU CẦU CHỨC NĂNG (FUNCTIONAL REQUIREMENTS)

#### Cấu hình AI (Màn hình riêng)
* **FR-12 — Cấu hình Provider**: Hỗ trợ 4 tùy chọn: Anthropic, OpenAI, Google Gemini, Custom (OpenAI-compatible). Khi chọn Custom, hiển thị trường Base URL. Có thể chỉnh sửa trước phiên mới; phiên đang diễn ra khóa provider/model.
* **FR-13 — BYOK**: Nhập, ẩn/hiện, xóa API Key. Key chỉ tồn tại trong bộ nhớ RAM server trong thời gian xử lý từng request; tuyệt đối không lưu ở server hay ghi vào log. Cảnh báo rõ ràng việc lưu key tại localStorage (văn bản thuần) và cung cấp tùy chọn "Session-only" (không lưu trên đĩa thiết bị, chỉ dùng trong tab hiện tại).
* **FR-14 — Quản lý Model**: Cho phép chọn model khả dụng từ provider hoặc tự nhập Model ID thủ công. Ghi nhớ Model ID đã chọn theo từng provider.
* **FR-15 — Custom Endpoint**: Nhập Base URL HTTPS và Model ID. Chặn localhost / private IP trong môi trường public.
* **FR-16 — Lấy danh sách Model**: Nút "Fetch Models" trực tiếp từ provider; nếu lỗi hoặc thiếu quyền, hiển thị thông báo thân thiện và luôn cho phép nhập thủ công.

#### Khởi tạo phiên phỏng vấn (Đúng 5 lựa chọn cốt lõi - FR-1)
1. **Vị trí ứng tuyển**: Input text tự do (2–120 ký tự) kèm chip gợi ý nhanh (Frontend Engineer, Fullstack, AI Engineer, Product Manager, Data Scientist...).
2. **Ngôn ngữ phỏng vấn**: Tiếng Việt hoặc English.
3. **Chế độ phỏng vấn**: Nghiêm khắc (Strict - chỉ hỏi tiếp) hoặc Kèm góp ý tức thì (Coaching - phản hồi ngắn từng câu rồi mới hỏi tiếp).
4. **Độ dài phiên**: Ngắn (5 câu), Vừa (8 câu), Dài (12 câu).
5. **Nguồn CV**: Không CV, Dán văn bản, Tải file PDF.

#### Xử lý CV (FR-2, FR-3, FR-4)
* **FR-2 — Nguồn CV**:
  - *Không CV*: Phỏng vấn dựa hoàn toàn vào vị trí ứng tuyển và mô tả (FR-4).
  - *Dán văn bản*: Đưa nội dung vào ngữ cảnh hệ thống, giới hạn tối đa 20.000 ký tự (FR-3).
  - *Tải PDF*: Lựa chọn đọc PDF nguyên bản (Direct multimodal - chỉ khi provider/model hỗ trợ) hoặc trích xuất văn bản (Text extract) trước khi gửi.
* Giới hạn file và xử lý fallback nếu không trích xuất được nội dung.

#### Hội thoại & Đánh giá (FR-5 -> FR-11, FR-17)
* **FR-5 & FR-6 — Luồng hội thoại**: AI đặt câu hỏi mở đầu streaming; hiển thị văn bản dần theo luồng. Phản hồi và câu hỏi tiếp theo được tách bạch trực quan.
* **FR-7 & FR-8 — Kiểm soát tiến trình**: Đếm số câu hỏi (vd: 3/8). Cho phép dừng sớm bất kỳ lúc nào từ câu đầu tiên (FR-8) mà không bị phạt điểm.
* **FR-9 — Báo cáo đánh giá chi tiết**:
  - Chấm điểm 4 tiêu chí cốt lõi (0–100): Nội dung (Content), Độ liên quan (Relevance), Độ rõ ràng (Clarity), Chiều sâu (Depth).
  - Điểm tổng quan (Overall Score), trích dẫn câu trả lời cụ thể, phân tích điểm mạnh / điểm cần cải thiện, 3–5 bước hành động tiếp theo, mức khuyến nghị tuyển dụng.
* **FR-10 — Chặn input quá tải**: Giới hạn câu trả lời tối đa 4.000 ký tự trước khi gửi lên API.
* **FR-11 — Khả năng phục hồi phiên**: Tải lại trang hoặc mở lại máy chủ không làm mất transcript vì toàn bộ lịch sử nằm tại SQLite máy chủ (FR-18).
* **FR-17 — Đồng nhất Schema Báo cáo**: Chuẩn hóa schema báo cáo trên mọi provider; dùng Structured Outputs khi khả dụng, fallback sang Prompt JSON validation + 1 lần auto-repair.

#### Lưu trữ SQLite & Lịch sử phiên (FR-18, FR-19, FR-20)
* **FR-18 — Server Lưu Trữ SQLite**: Lưu trữ sessions, message turns (kèm raw provider blocks), extracted CV, evaluation report, model config. Không cần đăng nhập.
* **FR-19 — Quyền riêng tư dữ liệu**: Hỗ trợ nút xóa từng phiên hoặc xóa sạch toàn bộ cơ sở dữ liệu trên máy chủ.
* **FR-20 — Quản lý State Session-based**: Client chỉ gửi `sessionId`, server tự nạp transcript lịch sử từ SQLite để duy trì tính nhất quán của token cache.

---

### 3. YÊU CẦU PHI CHỨC NĂNG (NFR)
* **NFR-1**: Streaming text mượt mà với UI hiển thị cursor và trạng thái hoàn tất rõ ràng.
* **NFR-2 & NFR-10**: API Key không bao giờ chạm vào SQLite hay log hệ thống. Cảnh báo rủi ro lưu trữ cục bộ.
* **NFR-3**: Bắt lỗi phân cấp (Invalid key, Model quota, Network timeout, Rate limit).
* **NFR-5**: Chạy trên nền tảng Node có đĩa bền vững (VPS, Docker volume, Railway/Fly volume). Không tương thích môi trường serverless không đĩa.
* **NFR-8**: Kiểm soát SSRF với Custom Endpoint (chặn dải IP nội bộ, loopback).
* **NFR-11**: Minh bạch rủi ro chia sẻ máy chủ không xác thực.
* **NFR-12**: Driver `node:sqlite` đồng bộ, tối ưu cho Next.js App Router dynamic runtime.