# Yêu cầu mở rộng InterviewAI Studio — VPS một chủ sở hữu

> Phiên bản: 1.0 · 2026-10-21 · Trạng thái: **đặc tả mục tiêu, chưa triển khai**  
> Tài liệu cùng bộ: [Thiết kế](design.md) · [Công việc](tasks.md). Nguồn gốc: [FR/NFR hiện có](../../stitch-screens/screens/00-requirements.md), [Stitch design system](../../stitch-screens/01-design-system.md). Khi khác nhau, các quyết định **đề xuất** ở đây chỉ áp dụng sau khi các task tương ứng hoàn tất; không mô tả hành vi hiện tại.

## 1. Mục tiêu, phạm vi và quyết định

- Cung cấp lộ trình triển khai **toàn bộ** cải tiến đã đề xuất: bảo vệ dữ liệu trên VPS, tạo phiên/PDF, backup/restore, độ tin cậy UI, lịch sử/cấu hình, vòng luyện tập và so sánh tiến bộ.
- Vẫn là ứng dụng **single-owner, BYOK** trên Node/SQLite có đĩa bền vững. Không thêm tài khoản đa người dùng, không gán quyền riêng cho từng phiên. Chủ sở hữu duy nhất được bảo vệ bởi lớp xác thực ingress trên VPS; ai đăng nhập vào ingress đều thấy toàn bộ dữ liệu. API key của nhà cung cấp AI là thông tin *khác* mật khẩu truy cập VPS; không lưu API key trong SQLite, backup hay log.
- Giữ năm lựa chọn tạo phiên cốt lõi trong FR-1; thêm **trọng tâm luyện tập** tùy chọn. Phiên hiện hành giữ snapshot provider/model/endpoint, không đổi theo preferences.
- FR-2 gốc nêu PDF multimodal trực tiếp khi hỗ trợ: **hoãn chức năng này**, đợt triển khai chỉ trích xuất text trên server. FR-8 gốc ghi “dừng từ câu đầu”: định nghĩa khả thi là dừng **sau câu trả lời đầu tiên đã lưu** để có dữ liệu đánh giá; trước thời điểm đó là *hủy phiên*, không sinh báo cáo. Hai điểm này cần được đối chiếu/cập nhật trong FR/NFR nguồn khi triển khai, không khẳng định nguồn đã thay đổi.
- Ưu tiên VPS: **không được công khai cổng backend trước khi đạt cổng kiểm soát phát hành ở §10**. Local/dev có thể tiếp tục dùng loopback và không yêu cầu ingress, nhưng không được lấy chế độ local làm lý do bỏ bảo vệ VPS.

### Hiện trạng cần phân biệt

| Hiện có (không phải mục tiêu) | Mục tiêu |
|---|---|
| API phiên/CV/DB không xác thực; README chỉ cảnh báo không công khai (`app/api/sessions/[id]/route.ts`, `app/api/admin/db/route.ts`). | Toàn bộ web/API sau HTTPS + xác thực ingress; backend không truy cập trực tiếp. |
| Export SQL thiếu `evaluation_attempts`, import chạy câu SQL không transaction (`app/api/admin/db/route.ts`). | Backup JSON versioned đủ sáu bảng, restore kiểu *replace* và rollback nguyên tử. |
| Client nhận PDF tới 20 MiB, API giới hạn data URL 20 triệu ký tự; session được ghi trước trích xuất (`app/new/page.tsx`, `app/api/sessions/route.ts`). | Giới hạn nhất quán 10 MiB; xem trước; trích xuất trước ghi DB; lỗi không tạo phiên mồ côi. |
| Rubric 0–100 nhưng UI ghi `/10`; telemetry giả; menu ẩn trên mobile (`app/session/[id]/page.tsx`, `app/page.tsx`, `components/TopBar.tsx`). | Thang điểm thống nhất; không có số liệu bịa; điều hướng và tương tác truy cập được. |
| Lịch sử lấy 50 phiên đầu, không phân trang; cấu hình model từng provider không được khôi phục đầy đủ (`app/api/sessions/route.ts`, `components/ByokConfigContext.tsx`). | Duyệt đủ lịch sử; ghi nhớ cấu hình theo provider và cô lập key. |

## 2. RQ-01 — Ranh giới truy cập VPS (P0)

- **RQ-01.1:** Public traffic chỉ đến ingress HTTPS (TLS hợp lệ), xác thực một chủ sở hữu **trước khi** phục vụ trang, static assets, mọi `/api/*` (kể cả `/api/admin/*`, `/api/sessions/*/attempts?raw=1`, `/api/models`, SSE). Backend chạy trên mạng/container riêng, không publish `0.0.0.0:12213` ra Internet; DNS/firewall không được tạo đường vòng trực tiếp.
- **RQ-01.2:** Cấu hình ingress có secret sinh ngẫu nhiên đủ mạnh, giữ ngoài repo/image và giới hạn quyền file; log, header chuyển tiếp, error page, cache/CDN không tiết lộ secret, BYOK key hoặc dữ liệu CV/transcript. Không dùng `x-api-key` của provider, session ID, nút ẩn trên UI hay header `X-Forwarded-*` từ client làm danh tính.
- **RQ-01.3:** Mọi thao tác thay đổi trạng thái (`POST`, `PUT`, `PATCH`, `DELETE`; kể cả test-key/models có thể tạo traffic, tạo/xóa phiên, evaluate, SSE, admin) phải kiểm tra `Origin` khớp **chính xác** origin HTTPS công khai do operator cấu hình. Thiếu/sai Origin ⇒ từ chối; không lấy origin tin cậy từ Host/forwarded headers. Auth ingress và chống CSRF là hai lớp khác nhau. Không cung cấp CORS cho origin khác; nếu sau này hỗ trợ CLI, thiết kế cơ chế riêng thay vì mở ngoại lệ origin vô điều kiện.
- **RQ-01.4:** Response chứa PII/backup/raw diagnostic có `Cache-Control: private, no-store` ở ứng dụng và không cache tại ingress; kết nối SSE không bị proxy buffer hoặc timeout quá sớm. `/api/admin/schema` và trạng thái DB cũng chỉ ở sau xác thực.
- **RQ-01.5:** Local/dev chỉ bind loopback (Docker host-port `127.0.0.1:12213:12213` hoặc `HOSTNAME=127.0.0.1` nếu chạy trực tiếp). Không đồng nhất kiểm tra IP/Host header với xác thực. Tùy chọn custom endpoint tới private IP `ALLOW_PRIVATE_BASE_URL=1` không được bật trên VPS công khai nếu chưa có phân tích rủi ro riêng.

**Nghiệm thu:** chưa đăng nhập không đọc được bất kỳ trang/API dữ liệu nào; `GET .../attempts?raw=1`, backup, import, DELETE cũng bị chặn. Không thể kết nối backend từ bên ngoài proxy. Request sai/thiếu Origin không thay đổi DB; request hợp lệ thực hiện và stream SSE được. Tắt/thiếu secret hoặc cấu hình ingress sai không được biến hệ thống thành public không xác thực. Sau restart/đăng nhập lại, các trang hoạt động mà BYOK key không bị đưa lên server lâu dài.

## 3. RQ-02 — Sao lưu và khôi phục dữ liệu (P1)

- **RQ-02.1:** Backup có định dạng JSON versioned (format version + schema version + timestamp + các bảng + số hàng), xuất theo **một snapshot nhất quán**. Bao gồm `sessions`, `message_turns`, `cv_extracts`, `evaluations`, `evaluation_attempts`, `model_configs`; không lưu API key, cookie/secret truy cập hay PDF bytes. Cần cảnh báo backup có CV, transcript, raw model output và endpoint URL nhạy cảm.
- **RQ-02.2:** Restore là **thay thế toàn bộ dữ liệu ứng dụng**, không merge. Chỉ chấp nhận format/version/schema hợp lệ; giới hạn request/backup **50 MiB UTF-8** trên cả luồng nhận, không chỉ header `Content-Length`. Nếu DB lớn hơn, trả lỗi rõ và hướng dẫn backup vận hành SQLite ngoài trình duyệt; không cắt dữ liệu.
- **RQ-02.3:** Xác minh dữ liệu và khóa ngoại; transaction bao trùm việc xóa và nhập toàn bộ dữ liệu. Bất kỳ lỗi parse, version, size, constraint, integrity hay ghi DB nào đều giữ nguyên DB cũ. Import lại chính file cho kết quả tương đương. Không thực thi SQL lấy từ file upload. Từ chối `.sql` legacy trên API, tài liệu hóa cách chuyển đổi thủ công có kiểm soát nếu cần.
- **RQ-02.4:** UI trước restore nêu số bản ghi cần thay, tổng số bản ghi đang có, cảnh báo không thể undo và yêu cầu xác nhận có chủ đích; khuyến nghị tải backup cũ. UI chỉ thông báo backup/restore thành công khi HTTP `ok` và kiểm chứng xong. Các thao tác wipe cũng nguyên tử.

**Nghiệm thu:** xuất DB có nhiều evaluation attempts, quotes, newline, semicolon, Unicode và NULL → nhập vào DB test mới → đối chiếu đủ sáu bảng/báo cáo/trạng thái. Payload sai/truncated/oversize/vi phạm FK/lỗi ghi không thay đổi DB cũ; nhập lặp không tạo bản sao. Backup ở lúc có WAL và thao tác ghi đồng thời vẫn nhất quán.

## 4. RQ-03 — CV/PDF và tạo phiên (P1)

- **RQ-03.1:** PDF gốc tối đa **10 MiB (10 × 1024 × 1024 byte)**, CV text lưu tối đa **20.000 ký tự**; giới hạn đầu vào đồng nhất ở client/API. Server xác nhận data URL MIME `application/pdf`, base64 hợp lệ, kích thước bytes sau giải mã và nhận dạng file PDF; không tin riêng `file.type` hoặc `Content-Length`. Paste phải có text sau trim; `none` không kèm CV. Không âm thầm cắt paste quá giới hạn.
- **RQ-03.2:** PDF hợp lệ nhưng không có text trích xuất được (image-only, encrypted, rỗng) trả lỗi hướng dẫn chọn PDF có text hoặc đổi sang Paste/Không CV; không fallback ngầm. File bytes không lưu trong SQLite/backup.
- **RQ-03.3:** `/new` cung cấp preview phần **text hiệu lực sẽ vào prompt** cho paste/PDF (hiện prompt chỉ lấy tối đa 6.000 ký tự trong `lib/prompts.ts`), cảnh báo nếu text lưu bị cắt hoặc prompt chỉ dùng một phần; trình bày rõ “file xử lý ở server VPS; đoạn text CV đi tới AI provider khi phỏng vấn”. Preview không gọi provider/không tạo session. Khi chọn file khác phải hủy preview cũ và xác nhận lại. Server trích xuất/kiểm tra lại tại lúc tạo; nếu preview không còn khớp, yêu cầu preview lại thay vì gửi nội dung khác.
- **RQ-03.4:** Thực hiện xử lý PDF bất đồng bộ **trước** transaction DB; rồi insert session, CV extract và upsert cấu hình trong transaction ngắn. Bất kỳ lỗi nào tạo **0** session/extract mới và không đổi preferences trước đó. `cvSource` và CV extract phải nhất quán.

**Nghiệm thu:** các trường hợp `none`, Paste, PDF hợp lệ thành công; PDF quá 10 MiB, MIME/signature/base64 sai, không có text, lỗi parser, dữ liệu preview cũ, lỗi ở insert CV hoặc upsert config đều thất bại có thông báo, không để session mồ côi. Đoạn text được preview trùng với đoạn dùng khi tạo (đối với client bình thường). Không chờ PDF parser trong SQLite transaction.

## 5. RQ-04 — Phỏng vấn, thông tin trung thực và truy cập được (P1)

- **RQ-04.1:** Điểm coaching chuẩn integer **0–100** xuyên prompt → parser/SSE → SQLite → UI; ví dụ 70 hiển thị `70/100` và bar 70%, kể cả sau reload. Strict không hiện coaching. Câu cuối được phân tích trong báo cáo; không hứa micro-rubric tức thời nếu pipeline chưa sinh nó.
- **RQ-04.2:** Khi đã lưu ≥1 câu trả lời, dừng sớm được khi có câu hỏi đang chờ: nếu ô trống, đánh giá các câu đã lưu; nếu có nội dung, hỏi rõ có lưu nội dung đó làm câu cuối, tránh gửi lặp khi mất stream/reload. Trước câu trả lời đầu: cho hủy phiên, không chấm báo cáo rỗng. Không phạt điểm chỉ vì dừng sớm; trạng thái `active → evaluating → completed/failed` và retry claim giữ tính nhất quán.
- **RQ-04.3:** Bỏ card “Min/Avg 38/46 ms”, `$0` và các trạng thái giả. Nếu thêm telemetry thực sau đó, chỉ dùng số liệu đã lưu, gắn nhãn khoảng đo/mẫu số, trạng thái thiếu dữ liệu và không suy ra phí provider. Không báo kết nối thật qua animation tĩnh.
- **RQ-04.4:** Header có menu mobile chứa tất cả đích chính, có nhãn, `aria-expanded`, thoát bằng Escape; action thiết yếu trong phiên không chỉ ở sidebar ẩn. Nhãn `<label>`/`aria-label` cho input, select, textarea, delete; trạng thái chọn, lỗi và kết quả async được thông báo qua screen reader; tab/focus/keyboard và bố cục khi bật bàn phím mobile sử dụng được. Ngôn ngữ document/phần nội dung phải phù hợp vi/en.

**Nghiệm thu:** test 70/100 trước/sau reload; dừng sớm với và không có text tạo đúng số turn, 1 report, không duplicate khi retry; 0 answer không sinh report. Thử bàn phím/touch/screen reader ở 375 px và desktop cho BYOK, chọn PDF, trả lời, dừng, retry, xóa. Không còn hiển thị telemetry/phí giả.

## 6. RQ-05 — Lịch sử và cấu hình provider (P2)

- **RQ-05.1:** Danh sách phiên trả `limit`, cursor/offset, `hasMore` hoặc tổng số, lọc/sort/search đồng nhất; thứ tự ổn định nhờ khóa phụ duy nhất (ID). UI có trước/sau, chỉ báo vị trí/tổng, lỗi và empty state; filter/sort/search mới đưa về trang đầu. Debounce tìm kiếm, bỏ/hủy response cũ.
- **RQ-05.2:** Với hơn 100 phiên cùng một số timestamp, duyệt mọi phiên phù hợp đúng một lần khi dữ liệu không đổi. Chuyển trang không tải lại toàn bộ transcript/CV. `/report` vẫn trỏ phiên hoàn tất mới nhất; trang `/session` chọn phiên đang hoạt động cũng không được âm thầm làm mất đường vào các phiên còn lại.
- **RQ-05.3:** Chuyển provider A→B→A khôi phục Model ID, base URL và tham số A đã chọn, kể cả ID nhập tay. Key B không chuyển sang A; key không lưu SQLite/backup. Chính sách session-only/localStorage hiện có áp dụng cho preferences trên browser; phiên cũ khóa provider/model/endpoint. Danh sách model trả về muộn không ghi đè lựa chọn mới.

**Nghiệm thu:** >100 phiên, ID/timestamp trùng thứ tự hợp lệ, filter/sort trang 2 rồi đổi filter, gõ nhanh và phản hồi đảo thứ tự đều không trùng/thiếu hoặc hiện kết quả cũ. A→B→A và reload giữ cấu hình theo lựa chọn lưu trữ; API key không lẫn provider.

## 7. RQ-06 — Vòng luyện tập và so sánh (P2)

- **RQ-06.1:** Từ `improvements`/`next_steps` của báo cáo có CTA “Luyện chủ đề này” mở `/new`, điền role, ngôn ngữ, **tối đa 3 trọng tâm tùy chọn** (tối đa 120 ký tự/trọng tâm) để người dùng sửa trước khi tạo. Không tự tạo phiên, không tự đính kèm CV cũ, không tự gửi dữ liệu tới provider chỉ vì nhấn CTA.
- **RQ-06.2:** Trọng tâm được validate/snapshot cùng session và dùng để định hướng prompt; không cho client thay đổi trọng tâm của phiên đã chạy. Prompt coi CV và trọng tâm là dữ liệu không tin cậy, không là chỉ thị điều khiển. Phiên legacy không có trọng tâm tiếp tục hoạt động.
- **RQ-06.3:** Chọn **đúng hai** phiên `completed`, có báo cáo hợp lệ, cùng role chuẩn hóa để so sánh score tổng và bốn pillar, ngày, provider/model, số câu trả lời; cảnh báo so sánh chỉ mang tính mô tả khi model/provider/số câu khác nhau. Không suy ra quan hệ nhân quả hoặc chấm lại AI; thiếu báo cáo thì không hiển thị so sánh sai.

**Nghiệm thu:** CTA chỉ prefill trường mong đợi, không kéo CV; session mới giữ trọng tâm và prompt có chúng; phiên cũ không đổi; chênh lệch điểm và cảnh báo đúng trên hai report fixture; không gọi provider khi xem màn so sánh.

## 8. Yêu cầu phi chức năng chung

- **NFR-VPS-01:** Node có `node:sqlite`, dữ liệu `/data` persistent (kèm WAL/SHM); image chạy non-root, healthcheck nội bộ; restart container không mất phiên. Snapshot phục hồi và rollback phải chạy được với DB tạm, không thử trên dữ liệu thật.
- **NFR-VPS-02:** Giới hạn payload PDF/backup ở cả read-stream và parser; phản hồi lỗi có mã/trạng thái hữu ích, không trả CV/key/SQL trong error; không log request headers, raw prompts hoặc secret. Raw diagnostic và file backup là dữ liệu nhạy cảm, chỉ hiển thị/tải khi đã xác thực.
- **NFR-VPS-03:** Không thoái hóa SSRF protection của custom provider (`lib/net/guarded-transport.ts`, `lib/net/url-policy.ts`). Custom opt-in và `ALLOW_PRIVATE_BASE_URL` độc lập với auth ingress.
- **NFR-VPS-04:** Mỗi RQ có test tự động ở cấp phù hợp và smoke test end-to-end; tài liệu runbook mô tả build-time `NEXT_PUBLIC_*`, secret, TLS, firewall, volume, backup/restore và recovery. Chi tiết thiết kế ở [design.md](design.md); phân chia triển khai ở [tasks.md](tasks.md).

## 9. Ngoài phạm vi đợt triển khai

Đa người dùng/SSO nội bộ ứng dụng; direct multimodal PDF; OCR ảnh PDF; giá/token cost chính xác theo provider; dashboard/chấm điểm lại toàn bộ lịch sử; tự động tuyên bố “tiến bộ” dựa trên hai báo cáo; nhập SQL tùy ý từ browser; đồng bộ cloud hoặc lưu BYOK key trên server.

## 10. Cổng kiểm soát trước khi đưa VPS ra Internet

**Không phát hành public** nếu còn bất kỳ mục nào: backend port reachable trực tiếp; trang/API không qua auth HTTPS; sai/thiếu Origin vẫn mutate; import tùy ý SQL qua API; backup/restore chưa kiểm thử rollback; volume không bền vững; BYOK key có mặt trong DB/backup/log; dữ liệu admin/raw bị cache; chưa thử SSE sau proxy; `npm run typecheck`, `npm test`, `npm run build` chưa đạt (hoặc chưa ghi rõ lỗi). Kết quả kiểm tra thủ công và bước rollback được lưu trong checklist phát hành ở [tasks.md](tasks.md).