# Thiết kế mục tiêu — InterviewAI Studio trên VPS

> Phiên bản: 1.0 · 2026-10-21 · **Thiết kế, chưa được triển khai**  
> [Yêu cầu](requirements.md) · [Task](tasks.md) · [FR/NFR gốc](../../stitch-screens/screens/00-requirements.md) · [Stitch design system](../../stitch-screens/01-design-system.md)

## D-01. Kiến trúc triển khai và biên tin cậy → RQ-01, NFR-VPS-01..03

```text
Internet/browser
    │ HTTPS, auth owner, no public caching
    ▼
Reverse proxy (cổng 443; xác thực tất cả đường dẫn)
    │ private Docker network / loopback only; streaming không buffer
    ▼
Next.js standalone Node (cổng container 12213, node server.js, USER node)
    │ node:sqlite; volume bền vững /data (db + WAL/SHM)
    ▼
SQLite  ───────► AI provider theo BYOK, không ghi API key
```

- VPS là **một chủ sở hữu**; chọn **Caddy làm reverse proxy** (TLS tự động và Basic Auth với mật khẩu băm, secret từ file/operator, không commit). Caddy phải xác thực *trước* mọi route, bao gồm `/`, `/new`, `/history`, `/report/*`, `/session/*`, `/_next/*`, `/api/admin/*`, `/api/sessions/*`, `/api/models`, `/api/test-key`. Không bảo vệ một số trang rồi để API cùng origin công khai. Proxy giữ kết nối SSE, tắt response buffering cho SSE, đặt timeout đáp ứng các lượt gọi model và đánh giá; không cache dữ liệu riêng. Chỉ probe healthcheck từ mạng nội bộ, tốt hơn dùng endpoint health không chứa dữ liệu DB/PII thay cho trang `/` sau khi auth bắt buộc. Basic Auth của trình duyệt có thể tự gửi lại credential nên vẫn phải kiểm tra Origin tại app; nếu thay Basic Auth bằng cookie auth sau này, cookie cần `HttpOnly; Secure; SameSite=Lax/Strict`. Không dùng credential proxy làm provider key.
- Container app **không publish ra interface public**. Có thể chạy app + proxy cùng Docker network private (không `ports` cho app), hoặc publish `127.0.0.1:12213:12213` nếu proxy chạy trên host. Firewall chỉ mở SSH được kiểm soát, 80 cho ACME nếu cần, 443; test từ host ngoài rằng 12213 không reachable. Proxy phải *xóa/ghi đè* identity và forwarded headers từ client; app không tin `X-Forwarded-*` để xác định auth/Origin. Route handler kiểm tra Origin/CSRF độc lập trên mọi mutation, so sánh toàn bộ serialized origin với `PUBLIC_ORIGIN=https://<domain>` cấu hình runtime trên server. Thiếu/khác Origin trả 403 **trước khi** parse body/gọi provider/ghi DB; từ chối `Origin: null`. Không cấp CORS cross-origin; quy tắc CLI/non-browser phải có thiết kế auth riêng nếu bổ sung sau. App phải nhận chính xác proxy ingress đã kiểm soát; check Origin đơn lẻ không thay thế việc cô lập backend.
- Auth proxy không cung cấp isolation nếu bị bypass; khi dùng proxy Basic Auth, cân nhắc CSRF vì trình duyệt tự gửi lại credential. Bộ quy tắc Origin trên server áp dụng cho POST JSON, DELETE và SSE; cần test với cơ chế đăng nhập thực tế, cookie của proxy và redirect của nó. Với trang nhạy cảm/JSON/backup, `Cache-Control: private, no-store` và `Referrer-Policy: no-referrer`; proxy không được ghi body/Authorization/`x-api-key` vào access log. Lớp rate-limit hợp lý ở ingress cho đăng nhập và endpoint tốn token; không làm hỏng SSE.
- `Dockerfile:57-89` đã dùng image multi-stage, `PORT=12213`, `HOSTNAME=0.0.0.0` **bên trong container**, `/data/interview_sessions.db`, `USER node`, `HEALTHCHECK`, `node server.js`; không viết lại thành `npm start:3000`. `README.md:125-137` hiện lỗi thời: cần sửa trong task triển khai. `NEXT_PUBLIC_PROVIDER_ENABLE` được inlined lúc `next build` (`Dockerfile:39-46`, `.env.example:7-10`); thay đổi phải rebuild. Giữ `ALLOW_PRIVATE_BASE_URL=0` trên VPS trừ cấu hình bảo vệ riêng cho local LLM, vì custom opt-in mở quyền kết nối nội mạng (`README.md:113-115`). Volume riêng cho `/data`, quyền writable cho user `node`, kiểm chứng WAL/SHM tồn tại sau tải; thử restore trên bản sao, không copy riêng `.db` đang mở trong WAL mode.
- API key BYOK hiện ở browser `sessionStorage` mặc định hoặc `localStorage` nếu opt-in (`components/ByokConfigContext.tsx`); chỉ đi qua request `x-api-key` khi gọi provider. Proxy TLS phải bao gồm cả đường này. Không lưu trong DB, backup, query string, local server env hay log. File backup và raw attempt có PII dù đã redaction key, xử lý như dữ liệu riêng tư.

**Hợp đồng triển khai:** tài liệu/runbook cung cấp ví dụ cấu hình reverse proxy được kiểm thử (TLS, auth, mạng private, no-cache, SSE, host/header sanitation), lệnh kiểm tra port và quy trình rotate secret/cert + khôi phục khi proxy hỏng. Không thêm file cấu hình triển khai ở giai đoạn viết spec này.

## D-02. Backup/restore và transaction → RQ-02

### Hợp đồng dữ liệu

Endpoint hiện `POST /api/admin/db` với `action=backup|import|wipe-*` (`app/api/admin/db/route.ts`) sẽ đổi sang hai bước an toàn: export file JSON; `validate-restore` trả metadata/counts và token xác nhận ngắn hạn gắn với **digest của bytes upload, server-side**; `commit-restore` xác nhận có chủ đích với cùng bytes/digest (hoặc payload đã giữ ở storage tạm an toàn có TTL). Không coi confirm phía UI là bảo vệ API; mỗi bước cũng qua ingress auth và Origin. Không có fallback thực thi SQL upload. Có thể giữ các action wipe/vacuum nhưng transaction hóa wipe, xác nhận cùng chính sách.

Envelope gợi ý (tên trường cố định và có schema kiểm chứng):

```json
{
  "format": "interview-ai-backup",
  "formatVersion": 1,
  "schemaVersion": 1,
  "createdAt": "2026-10-21T00:00:00.000Z",
  "tables": {
    "sessions": [], "message_turns": [], "cv_extracts": [],
    "evaluations": [], "evaluation_attempts": [], "model_configs": []
  },
  "counts": {
    "sessions": 0, "message_turns": 0, "cv_extracts": 0,
    "evaluations": 0, "evaluation_attempts": 0, "model_configs": 0
  }
}
```

- `schemaVersion` đọc từ `PRAGMA user_version` đang hỗ trợ (`lib/db.ts`); ví dụ trên minh họa DB v1, khi T-06 nâng schema thì export phải ghi v2 và importer có chính sách tương thích/migration rõ. Chọn một snapshot nhất quán trên connection SQLite, đảm bảo không có `await` giữa các SELECT trong transaction (process-local connection). Không đọc hết DB nếu sẽ vượt giới hạn HTTP 50 MiB: nếu snapshot export vượt hạn mức trả 413 + hướng dẫn backup offline nhất quán theo SQLite backup API; **không trả bản cắt ngắn**. Escape JSON bằng serializer, không split SQL theo dấu `;` (cách hiện tại lỗi với transcript/CV chứa xuống dòng). Export/import không chứa secret app/provider key.
- Read-stream của file JSON abort sớm khi >50 MiB, bất kể `Content-Length`; parse/validate root, version, đủ sáu bảng, tên cột/kiểu dữ liệu mong đợi, count, size và uniqueness (id, FK, turn/session). Từ chối trường/table lạ nguy hiểm, `schemaVersion` chưa hỗ trợ, sai kiểu, backup thiếu attempts. Không có payload SQL được chạy. Không chấp nhận `.sql` ở API; runbook hướng dẫn đường chuyển dữ liệu cũ offline trên DB bản sao nếu cần.
- `validate-restore` chỉ kiểm tra, không mutate DB. `commit-restore` phải kiểm tra lại cùng payload (digest/token chống thay file, token có TTL; **không** là auth thay cho proxy) rồi `BEGIN IMMEDIATE` → delete các bảng theo thứ tự con-trước-cha → insert theo thứ tự cha-trước-con, giữ ID → verify counts + `PRAGMA foreign_key_check` (và integrity kiểm tra phù hợp trong transaction) → `COMMIT`, rollback nếu bất kỳ bước nào lỗi. Duy trì `model_configs` và `evaluation_attempts`; cập nhật sequence/autoincrement nếu cần cho ID integer. Không giữ transaction qua `await` hay stream network. Cần giới hạn kích thước/khối lượng DB và bảo vệ chồng chéo request restore/wipe vs creation/evaluation bằng khóa thao tác bảo trì trong process + kiểm tra trạng thái dưới write lock; nếu đa process/replica, không triển khai cho tới khi có coordination xuyên process. Trên VPS này đề xuất **một process app, một volume DB**.
- UI: tải backup chỉ khi `response.ok` + content type hợp lệ; ở restore cho xem bảng count cũ/mới + cảnh báo sẽ thay toàn bộ; đòi confirm rõ ràng, khóa nút khi đang chạy, phản hồi lỗi không chứa SQL/PII. Không hiển thị raw payload trên màn hình. `GET /api/admin/db` status/schema chỉ sau auth; không expose DB path trên trang public.
- Tái sử dụng `getDb()`, `query()`, `exec()` (`lib/db.ts`) và mẫu `BEGIN IMMEDIATE/ROLLBACK` trong `app/api/sessions/[id]/messages/route.ts`; trích xuất codec vào module server-only riêng để test DB tạm. Đảm bảo không gọi async/provider trong transaction dùng connection singleton.

### Kiểm thử thiết kế

Xuất/import đủ 6 bảng với quote/semicolon/newline/Unicode/NULL, FK, attempts, CV và báo cáo; empty DB, WAL, thao tác ghi đồng thời. File bất hợp lệ/version khác/quá giới hạn/duplicate/corrupt/FK fail/bị thay sau validate → DB ban đầu nguyên vẹn. Nhập lặp và restart kiểm tra thứ tự ID, số hàng và integrity. Tạo phiên/gửi SSE song song restore phải bị chặn hoặc retry có lỗi rõ, không trộn hai thế hệ dữ liệu.

## D-03. PDF preview và tạo phiên nguyên tử → RQ-03

- Client `/new` kiểm tra PDF ≤10 MiB nhưng server là nguồn chân lý: parse `data:application/pdf;base64,` nghiêm ngặt, validate alphabet/padding, decoded-byte count/signature `%PDF-` và parser; không coi signature là chứng minh file an toàn. Giới hạn thời gian/CPU/memory của parser và độ lớn request ở ingress/route; `pdf-parse` chạy ở server-only (`lib/pdf.ts`). Trả lỗi phân biệt oversized, invalid, encrypted, image-only/empty và transient, tránh đưa parser stack/file bytes vào response.
- `POST /api/cv/preview` (cần auth/Origin, không lưu DB) nhận PDF bytes theo hợp đồng hiện tại hoặc stream upload có giới hạn; trả `{ textPreview, storedCharCount, truncated, promptCharCount, digest }`, trong đó digest = SHA-256 của **text chuẩn hóa có hiệu lực**, không phải token phân quyền. Với paste, preview cắt tối đa đoạn prompt sau normalize phía client/server; mọi phần được gửi thực tế phải thể hiện rõ. `lib/pdf.ts` đã có `extractPdfFromDataUrl`; `lib/prompts.ts` đang truncate CV trong prompt tới 6.000 ký tự. Dùng một helper server-only chung cho normalize/clip/preview và prompt để tránh bất nhất. Không lưu PDF gốc. Với 20.000 ký tự text được lưu và ≤6.000 đưa vào prompt, UI ghi rõ hai giới hạn.
- `POST /api/sessions`: Zod ràng buộc discriminated union `none`/`paste`/`pdf` (không dữ liệu thừa, không rỗng). Khi tạo từ PDF, server **tự giải mã và trích xuất lại** trước transaction, so digest text hiệu lực với preview digest do client cung cấp; digest là kiểm tra nhất quán UX, **không** là chứng thực bảo mật, client độc hại vẫn có thể tự gửi digest tùy ý; nếu khác trả conflict và yêu cầu preview lại. Nếu preview cần được chứng minh cho request không tin cậy, lưu token HMAC/nonce ngắn hạn phía server ràng buộc nội dung/owner — không giả định hash tự nó chứng minh người dùng đã xem. Tạo session chỉ sau khi text hợp lệ; ghi session, 0/1 extract, model-config snapshot/upsert trong `BEGIN IMMEDIATE ... COMMIT`, rollback mọi lỗi. Đảm bảo paste không bị cắt im lặng và filename không được dùng như path. Không await PDF parse giữa BEGIN/COMMIT.
- UI: preview nội dung **được gửi vào prompt** (không chỉ tên PDF), checkbox/acknowledgement quyền riêng tư nếu có CV, cảnh báo text đã clip, làm mới preview khi file/paste thay đổi; chọn PDF hỏng xóa stale selection/digest; đổi sang `none` xóa CV khỏi request, nhưng không tự đổi khi parser lỗi. Sau thành công chuyển `/session/[id]` như hiện tại.

## D-04. Phỏng vấn, mobile và số liệu → RQ-04

- Chuẩn hóa micro-rubric ở `0..100` (`app/api/sessions/[id]/messages/route.ts:278-292`, `lib/zod-schemas.ts`), sửa phần prompt text còn `/10` (`lib/prompts.ts`) và UI score/bar (`app/session/[id]/page.tsx:421-431`); report per-turn tiếp tục `/100`. Vì coaching trước câu tiếp theo có thể không chạy sau đáp án cuối, copy nói “góp ý giữa các lượt; câu cuối nằm trong báo cáo”, không hứa score live câu cuối. Nếu sau này muốn coaching câu cuối, thêm generation riêng và budget/test để không làm hỏng commit final/evaluation.
- Server giữ quy tắc `completedUserTurns>0` cho early-stop rỗng (`app/api/sessions/[id]/messages/route.ts:64-84`), nhánh có answer lưu một lượt cuối; UI có 2 lựa chọn rõ “Dừng và chấm các câu đã trả lời” và “Gửi câu đang soạn rồi chấm”. 0 câu trả lời thì nút “Hủy phiên” với xác nhận; không tạo report rỗng do `EvaluationReportSchema.per_turn.min(1)` (`lib/zod-schemas.ts`). Không gửi lặp sau SSE ngắt; tái hydrate DB/state và thử lại qua evaluation claim, không POST lại cùng answer. Strict mode không hiện score/tư vấn.
- Bỏ toàn bộ `TelemetryCard` giả (`app/page.tsx:506-541`) và các tuyên bố đo đạc không có nguồn; nếu triển khai số liệu thật ở PR tương lai, nguồn là `message_turns.latency_ms` + tokens đã ghi, ghi rõ sample count/thời gian, no-data, không suy ra phí provider. Các chấm nhấp nháy health/status tĩnh trên header/footer phải thay bằng nhãn trung tính hoặc nguồn trạng thái thật, không mô tả connectivity live nếu không đo.
- Mobile header trong `components/TopBar.tsx`: nút menu và nav ngoài breakpoint `lg`; `aria-expanded`, `aria-controls`, thoát Escape/chọn link; focus quay về trigger hợp lý. Thay icon avatar không tương tác bằng trang thái trung tính. Các action sidebar ẩn (hủy phiên/coaching) có chỗ truy cập khác trên mobile; composer không bị bàn phím che, dùng viewport động phù hợp. Liên kết label/input, `aria-pressed` hoặc radio semantics cho card selection, thông báo lỗi qua `role=alert`/`aria-live`, icon-only delete có tên mô tả phiên. Document `lang=vi` cho chrome tiếng Việt, gắn `lang=en` cho khối nội dung phỏng vấn tiếng Anh nếu không đổi toàn document (`app/layout.tsx`). Giữ token dark theme trong Stitch và `app/globals.css`.

## D-05. Lịch sử và BYOK preferences → RQ-05

- `GET /api/sessions`: có `limit` cap (ví dụ 25 mặc định, 100 tối đa), cursor opaque encode sort key + unique `id` (hoặc offset với snapshot nếu bảo đảm test); sort `created_at DESC, id DESC`, score/duration sort cũng thêm id tie-breaker; filter/search SQL parametrized, không cho input thô vào ORDER BY. Trả `{ sessions, nextCursor, hasMore, total? }` với cùng filter. Cursor đổi filter/sort là invalid; UI reset về trang đầu, stack cursors cho nút trước. Mục tiêu không trùng/thiếu khi dữ liệu không đổi; khi dữ liệu đang ghi song song, ghi rõ có thể đổi vị trí và cung cấp nút refresh, không hứa snapshot vô hạn. `app/report/page.tsx` và `app/session/page.tsx` cần cập nhật consumer cho hợp đồng mới nếu có thay đổi mặc định.
- `/history`: debounce q 250–400ms, `AbortController` hoặc request ID bỏ kết quả đến trễ, trạng thái lỗi không biến thành danh sách rỗng, chỉ báo kết quả phân trang; link báo cáo/phiên của mọi bản ghi. Không tải transcript/CV trong list. Việc chọn 2 phiên để so sánh dựa trên danh sách này nhưng validation ở server.
- `components/ByokConfigContext.tsx` hiện chỉ lưu `byok.config` cho một provider. Đề xuất lưu `byok.preferences.v1` map provider → `{ model, baseUrl, temperature, maxTokens, topP }`, **không** serialize apiKey trong preferences. Quyết định chính sách key khi chuyển provider: xóa key khỏi UI và yêu cầu nhập lại cho provider mới, kể cả quay lại A (an toàn hơn; sessionStorage/localStorage của key hiện tại theo opt-in vẫn tồn tại cho provider hiện tại). Nếu muốn lưu nhiều key sẽ là yêu cầu bảo mật riêng ngoài scope. Preferences lưu theo session-only/localStorage giống lựa chọn của người dùng; migrate từ cấu hình cũ không làm lộ key sang map; reset xóa các key/storage tương ứng. `model_configs` server hiện ghi khi tạo phiên, không phải nguồn chân lý override lựa chọn client; API key vẫn không vào DB. Fetch models cần request identity/abort để response cũ không thay lựa chọn thủ công. Session-config locking (`lib/providers/session-config.ts`) tiếp tục khóa phiên cũ.

## D-06. Trọng tâm luyện tập và so sánh → RQ-06

- `/report/[id]` tạo CTA từ bullet `improvements`/`next_steps` của `EvaluationReportSchema` (`lib/zod-schemas.ts`), chuyển `role`, `language`, tập `focus` từ nội dung báo cáo; truyền qua query ngắn/route state đã mã hóa URI, không truyền CV, raw transcript, API key. Nội dung bullet do AI tạo là **dữ liệu không tin cậy**; sanitize, giới hạn 3 × 120 ký tự và không đưa HTML chưa escape vào URL/DOM. Trang `/new` hiển thị focus để sửa/xóa và user xác nhận trước khi tạo; không tự POST tạo session.
- Migration SQLite có cột `sessions.focus_json` (default `[]`, validate trên API); giữ phiên cũ valid. Mở rộng Body create + prompt builder để thêm focus dưới dạng dữ liệu trích dẫn, không là system instruction, dùng role/cv với boundary rõ. `GET /api/sessions/[id]` trả focus snapshot; không cho cập nhật sau khi tạo. Không trộn focus mới vào phiên đang chạy từ browser preferences.
- Màn compare chọn đúng hai session status `completed`, role bằng nhau sau `trim`/whitespace normalization/case-fold, report JSON valid từ `safeParseStoredReport()`; server trả trường cần dùng (không trả raw blocks/CV) cho API compare hoặc client dùng endpoint report đã bảo vệ. Điểm chênh lệch `B − A`, bốn pillar + overall, ngày, provider/model, answered turns, chú thích khi provider/model/round count khác. Dữ liệu báo cáo đã lưu là mô tả, không thêm lời khẳng định nhân quả/độ tin cậy thống kê; không gọi AI khi render so sánh. Trạng thái lỗi thiếu/invalid report thể hiện rõ; không hiển thị 0 giả.

## D-07. Kiểm chứng và vận hành → mọi RQ

- Unit/route tests trên DB tạm riêng, không chạm `data/` của dev/prod; setup `INTERVIEW_DB_PATH` trước import `lib/db.ts`. Có fixtures PDF hợp lệ/hỏng/image-only và fixture report; kiểm tra transaction, uniqueness, FK, concurrency, secret không rò. Giữ test split `.mjs` network / `.ts` app (`package.json`), bổ sung các test route/logic mới và smoke test qua reverse proxy thật.
- Trước public deploy: `npm ci`, `npm run typecheck`, `npm test`, `npm run build` trên môi trường Node phù hợp; `npm run lint` hiện chưa có config non-interactive, task triển khai phải cấu hình lint hoặc ghi rõ chưa chạy; test Docker volume/restart, DNS/port/firewall, cert/auth, Origin, SSE, status 403/401, backup→restore trên DB thử nghiệm và rollback; soát log/backup/SQLite không có key. Có runbook rotate auth secret, backup retention/permissions, định kỳ restore drill, khôi phục từ lỗi deploy. **Tài liệu này không xác nhận bất kỳ kiểm thử hoặc deploy nào đã diễn ra.**