# Backlog triển khai — InterviewAI Studio trên VPS

> Phiên bản: 1.0 · 2026-10-21 · **T-01 (một phần) và T-02 đã triển khai ở mức code + test; checkbox phản ánh phần đã kiểm chứng, không xác nhận VPS đã được phát hành.**  
> [Yêu cầu](requirements.md) · [Thiết kế](design.md) · [FR/NFR gốc](../../stitch-screens/screens/00-requirements.md) · [Stitch UI](../../stitch-screens/01-design-system.md)

## Nguyên tắc thực hiện

- Mỗi PR nêu rõ RQ và phần thiết kế tương ứng, migration/rollback, test và bằng chứng nghiệm thu. Không deploy VPS public ở trạng thái code hiện tại: API DB/CV vẫn thiếu auth ở tầng ứng dụng và ingress của T-01 chưa smoke-test trên staging. Import SQL thực thi đã bị gỡ ở T-02, nhưng điều đó không thay thế được auth.
- Đối với mọi test DB, dùng file tạm riêng và gán `INTERVIEW_DB_PATH` **trước** khi import `lib/db.ts`; không xóa DB đang có. Không cho nhiều replica app cùng dùng một volume SQLite nếu chưa thiết kế coordination. Giữ key provider ở browser/per-request, không log/header-forward vào analytics.
- Thứ tự cổng: **T-01 (biên VPS)** trước khi public; **T-02 (backup/restore)** và **T-03 (PDF)** trước khi xử lý dữ liệu thực; T-04/T-05 có thể phát triển sau đó; T-06 phụ thuộc T-05; T-07 là kiểm thử phát hành tổng.

## T-01 — VPS ingress và chính sách Origin (P0) → RQ-01; D-01

- [ ] **T-01.1 / topology:** tạo Compose/Caddyfile mẫu theo D-01 (Caddy TLS tự động + Basic Auth hash từ secret do operator quản lý + persistent volume), không publish cổng app ra Internet; auth single-owner bao phủ `/_next/*`, pages, `/api/*`, SSE; chỉ proxy nói chuyện với app. Nếu proxy trên host, bind `127.0.0.1:12213`; không triển khai trực tiếp `-p 12213:12213` public. Giữ secret ngoài repo/image, quyền file, rotate và recovery. Cập nhật `.env.example` cho origin HTTPS và config ingress, không ghi password/secret vào `NEXT_PUBLIC_*`.
- [x] **T-01.2 / server:** tạo helper server-only để so sánh `Origin` với `PUBLIC_ORIGIN` cố định; áp dụng tập trung trên **toàn bộ mutation**, gồm `/api/admin/db`, `/api/sessions`, `/api/sessions/[id]` DELETE, `/messages`, `/evaluate`, `/api/models`, `/api/test-key`, preview và các route mới. Không cho `Origin: null`/missing; trả 403 trước side effect; bảo đảm không tin Host/X-Forwarded để quyết định truy cập. Thiết lập `Cache-Control: private, no-store` cho CV/report/attempts/backup/status. Cân nhắc CSP/headers phù hợp sau khi xác nhận không hỏng font/assets hiện tại. **Đã kiểm chứng trong code hiện tại:** bảy mutation hiện có được guard trước side effect; route preview chưa tồn tại nên khi bổ sung ở T-03 phải dùng cùng helper. Header no-store/no-referrer được test trên GET nhạy cảm, SSE giữ no-transform; CSP chưa thêm để tránh ảnh hưởng assets.
- [ ] **T-01.3 / docs + test:** thay đoạn Dockerfile mẫu lỗi thời `README.md:125-137` bằng hướng dẫn chạy image standalone hiện có (`Dockerfile:57-89`, `PORT=12213`, `/data`, `node server.js`); tài liệu build-time `NEXT_PUBLIC_*`, runtime `ALLOW_PRIVATE_BASE_URL=0`, firewall, TLS, WAL/SHM, auth và recovery. Smoke test anonymous/đã auth cho tất cả pages/API (kể cả `?raw=1`, schema, backup); Origin missing/mismatch trên DELETE/POST/SSE; SSE xuyên proxy; port 12213 từ ngoài bị chặn; không lộ `x-api-key` trong proxy logs. Chỉnh healthcheck nội bộ để không yêu cầu đăng nhập vào `/` qua proxy.

**Đụng tới:** `Dockerfile`, `.env.example`, `README.md`, `lib/env.ts`, `app/api/**/route.ts` và module auth/origin mới; config proxy/deploy + test route/integration.  
**Trạng thái T-01 (2026-10-21):** T-01.2 đã kiểm chứng bằng test route/unit với DB tạm, typecheck, npm test và build; không có VPS/DB thật bị tác động. Mẫu Compose/Caddy và runbook đã tạo, `docker compose config` qua kiểm tra tĩnh, nhưng Docker daemon/Caddy binary chưa khả dụng để chạy Caddy validate và smoke test proxy thật; **T-01.1 và T-01.3 chưa hoàn tất**. Cần thực hiện smoke test trên môi trường disposable/staging: anonymous và auth toàn bộ paths, backup/raw/schema, SSE đi qua Caddy, Origin đúng/sai, firewall/port 12213 từ ngoài, secret thiếu/sai, quyền volume sau restart, log không có `x-api-key`, rồi mới tick mục còn lại. Không cấu hình VPS public khi T-02/T-07 còn mở.

**DoD:** khách chưa đăng nhập không đọc/thay đổi dữ liệu; request cross-origin không tạo traffic provider hay mutate; auth đúng vẫn stream; backend không reachable từ Internet. Không coi chỉ có Origin check là đủ nếu ingress bị bypass.

## T-02 — Backup JSON v1, restore an toàn (P1) → RQ-02; D-02

- [x] **T-02.1 / codec:** định nghĩa schema JSON và parser cho đủ sáu bảng `sessions`, `message_turns`, `cv_extracts`, `evaluations`, `evaluation_attempts`, `model_configs` theo `lib/db.ts:64-179`; metadata format/schema version, counts, giới hạn 50 MiB trên stream nhận/xuất. Snapshot nhất quán, không xuất secret; trả lỗi version/quá lớn thay vì truncated file. Không dùng splitter SQL.
- [x] **T-02.2 / validate + commit:** bổ sung API validate-restore và commit-restore xác nhận digest bytes/token hết hạn dưới auth/Origin; chỉ commit payload đã validate, transaction `BEGIN IMMEDIATE`, kiểm tra `foreign_key_check`, counts/integrity rồi commit; rollback trên mọi lỗi. Thiết kế khóa bảo trì để chặn create/messages/evaluate/wipe xen restore trên process; document single-process assumption. Wipe-all/wipe-sessions nguyên tử. Không chạy file `.sql` qua API.
- [x] **T-02.3 / UI:** `/history` kiểm tra `response.ok` trước khi tải backup, validate file và hiển thị count cũ/mới, lời cảnh báo replace và xác nhận rõ; disable nút khi busy, thông báo lỗi thành công trung thực. Nếu backup >50 MiB, hiển thị hướng dẫn backup SQLite offline thay vì file thiếu.
- [x] **T-02.4 / test:** round-trip DB tạm có dữ liệu Unicode/quote/newline/`;`/NULL/raw attempts; FK và sequence; snapshot khi ghi; empty DB/WAL; import lặp; payload sai/truncated/oversize/duplicate/version/FK/injected write failure và swapped file giữa validate/commit ⇒ DB nguyên vẹn. Thử restart sau restore và kiểm tra không có key ở file export.

**Đụng tới:** `app/api/admin/db/route.ts`, `app/history/page.tsx`, `lib/db.ts`, codec/validator module server-only và test mới.

**Trạng thái T-02 (2026-10-21):** đã kiểm chứng bằng test trên DB tạm, `npm run typecheck`, `npm test` (80/80 network + 40/40 TypeScript) và `npm run build`; **không VPS/DB thật nào bị tác động** (`data/interview_sessions.db` nguyên vẹn).

- **Codec** (`lib/backup.ts`): envelope `{format, formatVersion, schemaVersion, createdAt, tables, counts}` với schema strict tường minh cho đủ sáu bảng, chỉ xuất cột ứng dụng (không secret/`sqlite_sequence`); một `BEGIN DEFERRED` bao trọn sáu bảng nên snapshot nhất quán kể cả trang WAL; quét keyset theo `rowid` để không O(n²); giới hạn 50 MiB đếm **byte UTF-8 thực** trên cả upload stream lẫn export và **từ chối** thay vì truncate. Validator strict từ chối field lạ (kể cả `api_key`), sai version, count mismatch, trùng PK/turn/evaluation và hàng mồ côi. Splitter SQL đã bị gỡ khỏi API.
- **Validate/commit**: `/api/admin/db/validate-restore` không ghi DB, phát token 5 phút gắn SHA-256 của **đúng các byte upload** cùng một *revision* (counts + fingerprint nội dung); `/api/admin/db/commit-restore` đọc lại byte, tái validate, kiểm token một-lần và **kiểm lại fingerprint ngay trong `BEGIN IMMEDIATE`** — nên một thay đổi giữa validate và commit (kể cả `UPDATE` làm số dòng không đổi) bị từ chối 409 thay vì ghi đè dữ liệu mới hơn. Restore xóa con-trước-cha, chèn cha-trước-con giữ nguyên ID, dựng lại `sqlite_sequence`, kiểm counts + `foreign_key_check` + `integrity_check` trước COMMIT, rollback mọi lỗi. `lib/maintenance.ts` giữ lease xuyên suốt mọi `await` (PDF, provider, SSE, evaluation) nên không route nào ghi xen giữa restore; giả định **một process / một volume SQLite** đã ghi rõ trong `README.md` và `deploy/README.md`.
- **UI**: chỉ tải file sau `response.ok` + kiểm `content-type` JSON, validate file rồi hiện count cũ/mới của cả sáu bảng kèm tổng và mã trạng thái DB; nút commit bị khoá khi busy / chưa tick xác nhận / file đã đổi; có `confirm()` lần cuối; lỗi 413 hiện hướng dẫn backup SQLite offline. Tải lại danh sách thất bại giờ hiện cảnh báo thay vì render "0 dòng" như thể dữ liệu đã bị xoá.
- **Test**: `lib/backup.test.ts` (10), `lib/admin-backup.test.ts`, `lib/maintenance.test.ts` (7), `lib/backup-restart.test.ts` (2) — round-trip Unicode/quote/newline/`;`/NULL/raw attempts, sequence, **restart thật bằng process con** (AUTOINCREMENT tiếp tục từ max đã phục hồi), **writer độc lập qua WAL**, payload sai/oversize/duplicate/version/FK, ghi lỗi giữa transaction (trigger `RAISE(ABORT)` ⇒ DB nguyên vẹn), file bị đổi và token hết hạn/tái sử dụng giữa validate/commit, và xác nhận file export không chứa `api_key`.
- **Chưa kiểm chứng (giữ ngoài phạm vi test tự động):** smoke thật qua ingress Caddy (Docker daemon/Caddy binary không khả dụng trên máy này), giới hạn upload ở tầng proxy, hành vi sau restart của *tiến trình app* dài hạn, và drill restore/rollback trên volume thật. UI không có harness E2E trong repo nên phần `/history` mới kiểm bằng đọc code + test route, chưa chạy trên trình duyệt. Vẫn chưa tick T-01.1/T-01.3/T-07; không public VPS khi còn các mục đó mở.

**DoD:** sáu bảng phục hồi, nguyên tử và nhập lại được; upload SQL từ browser bị từ chối; backup lỗi không được tải như thành công.

## T-03 — PDF, preview và tạo phiên transaction (P1) → RQ-03; D-03

- [ ] **T-03.1 / validation:** đồng bộ giới hạn PDF 10 MiB, Paste 20.000 ký tự; server kiểm MIME/data URL/base64 chặt, byte length/signature/PDF parse và text sau trim, giới hạn parser. Zod request ràng buộc đúng `cvSource` (none/paste/pdf), không chấp nhận dữ liệu thừa hay CV thiếu, không cắt paste thầm lặng. Loại bỏ state PDF cũ khi chọn file lỗi.
- [ ] **T-03.2 / preview + thông điệp:** endpoint preview auth/Origin, không lưu PDF/DB; trả text hiệu lực, trạng thái truncate 20k/6k, digest để đối chiếu *nhất quán UX*; `/new` hiển thị text sẽ vào prompt, cho sửa/chọn lại, xác nhận văn bản sẽ tới AI provider; không ghi “không upload lên cloud” mà không phân biệt file và text.
- [ ] **T-03.3 / atomic create:** trích xuất lại PDF **trước** SQLite transaction, so digest preview và nội dung mới; insert session + CV extract + model config trong transaction ngắn, rollback mọi lỗi. Không giữ lock khi await parser. Xác định đường xử lý thay đổi file/preview stale (409 cần preview lại).
- [ ] **T-03.4 / test:** boundary 10 MiB và kích thước data URL thực, file MIME/signature/base64 sai, PDF rỗng/ảnh/khóa/parser lỗi, paste rỗng/quá dài; lỗi insert CV/upsert model config không tạo session hoặc làm đổi prefs; preview khác text lưu thì không tạo; bytes PDF không có trong DB/backup. Thử prompt nhận đúng phần text đã hiển thị.

**Đụng tới:** `app/new/page.tsx`, `app/api/sessions/route.ts`, preview route mới, `lib/pdf.ts`, `lib/validate.ts`, `lib/prompts.ts`, test DB/API.  
**DoD:** failure không để lại phiên mồ côi; thông báo quyền riêng tư và giới hạn thống nhất ở UI/API/prompt.

## T-04 — Phỏng vấn, telemetry, mobile/a11y (P1) → RQ-04; D-04

- [ ] **T-04.1 / scoring:** sửa prompt/UI bar/badge theo 0–100, strict không hiện coaching, nói rõ câu cuối được đánh giá ở report thay vì hứa live coaching; test SSE 70/100 trước và sau rehydrate/reload.
- [ ] **T-04.2 / early stop:** UI xác nhận riêng dừng không gửi draft vs gửi draft làm câu cuối; nếu chưa có câu trả lời, cung cấp hủy phiên có xác nhận, không tạo báo cáo rỗng. Test với 0, 1, nhiều câu, draft/không draft, finalization retry/concurrent claim, disconnect sau persisted tránh duplicate. Giữ logic server trong `messages/route.ts` làm nguồn chân lý.
- [ ] **T-04.3 / thông tin thật:** xóa `TelemetryCard` hard-code và `$0` trên trang BYOK, thay chấm trạng thái/health động không có nguồn bằng nhãn trung tính; nếu thêm số đo mới, chỉ từ `message_turns.latency_ms`/token, ghi mẫu số và no-data, **không** gọi là phí provider.
- [ ] **T-04.4 / mobile/a11y:** header có menu mobile Escape/focus/`aria-expanded`; action hủy và feedback vẫn tới được khi sidebar/drawer ẩn; field label, icon-delete aria-label, card selected semantics, error/status live region, ngôn ngữ vi/en và composer không bị bàn phím mobile che. Kiểm thử touch/keyboard/screen reader ở viewport 375 px và desktop.

**Đụng tới:** `lib/prompts.ts`, `app/session/[id]/page.tsx`, `app/api/sessions/[id]/messages/route.ts`, `app/page.tsx`, `components/TopBar.tsx`, `components/FooterBar.tsx`, `app/layout.tsx`, `app/history/page.tsx`, tests/UI.  
**DoD:** 70 hiện 70/100 với 70% bar, dừng sớm đúng lượt, không có dữ liệu giả và điều hướng đủ trên mobile.

## T-05 — Lịch sử và cấu hình theo provider (P2) → RQ-05; D-05

- [ ] **T-05.1 / API list:** thêm phân trang có cursor và id tie-breaker cho mọi sort, filter/search an toàn, nextCursor/hasMore và count nếu cần; test >100 phiên, trùng timestamp, sort score/duration có NULL, đổi filter, trang cuối; đánh giá tác động tới consumers `/session` và `/report`.
- [ ] **T-05.2 / history UI:** page controls, count/hasMore, reset khi đổi filter/search, debounce, abort/ignore stale fetch; phân biệt lỗi mạng với danh sách rỗng, và bảo đảm các phiên ngoài trang đầu vẫn truy cập được.
- [ ] **T-05.3 / provider prefs:** map từng provider chỉ gồm model, baseUrl, temperature, maxTokens, topP; switch provider clear key, khôi phục prefs; migrate config cũ, tôn trọng session-only/localStorage và reset; ngăn fetchModels cũ thay manual model; giữ khóa provider/model/endpoint của phiên đang chạy.
- [ ] **T-05.4 / test:** đổi A→B→A/reload/tab closure/localStorage opt-in và stale model response, key không lẫn/không vào SQLite; pagination qua nhiều filter/sort và request đảo thứ tự không hiện kết quả sai.

**Đụng tới:** `app/api/sessions/route.ts`, `app/history/page.tsx`, `app/session/page.tsx`, `app/report/page.tsx`, `app/page.tsx`, `components/ByokConfigContext.tsx`, `lib/providers/session-config.ts` (giữ invariant), tests.  
**DoD:** duyệt mọi phiên phù hợp đúng một lần trên dữ liệu đứng yên; lựa chọn model từng provider và quyền riêng tư key đúng.

## T-06 — Vòng luyện tập + so sánh hai báo cáo (P2) → RQ-06; D-06

- [ ] **T-06.1 / migration:** mở rộng sessions với `focus_json` mặc định `[]`, migration có version/rollback, validate tối đa 3 × 120 ký tự; test mở DB v1 cũ và v2 mới, không ảnh hưởng dữ liệu/báo cáo cũ.
- [ ] **T-06.2 / tạo phiên:** `/new` thêm focus sửa/xóa được, nhận prefill từ CTA report nhưng không CV/key; API tạo session snapshot focus, prompt dùng như *dữ liệu ưu tiên* (không tin là system instruction); test prompt, length/escaping, state phiên sau reload.
- [ ] **T-06.3 / report CTA:** `improvements`/`next_steps` có nút “Luyện chủ đề này”, giới hạn/sanitize text AI, prefill role/language/focus, không tự POST. Test click không truyền transcript/CV/API key.
- [ ] **T-06.4 / compare:** từ lịch sử chọn đúng 2 phiên completed cùng role; validate report server-side, UI điểm tổng + 4 trụ, delta B−A, provider/model/số câu/ngày, cảnh báo không tương đồng và trạng thái thiếu report. Không gọi model để vẽ compare; test các trường hợp 0/100, thiếu report, khác provider/rounds, role khác.

**Đụng tới:** `lib/db.ts`, `lib/types.ts`, `lib/prompts.ts`, `lib/zod-schemas.ts`, `app/api/sessions/route.ts`, `app/new/page.tsx`, `app/report/[id]/page.tsx`, `app/history/page.tsx`, route/page compare mới và tests.  
**DoD:** CTA tạo được phiên do người dùng xác nhận, dữ liệu cũ vẫn đọc được, so sánh không tuyên bố nhân quả.

## T-07 — Phát hành và vận hành VPS (P0 release gate) → mọi RQ; D-07

- [ ] Đối chiếu tất cả RQ với test/UX/API; cập nhật FR/NFR gốc tại `stitch-screens/screens/00-requirements.md` sau khi chốt việc FR-2 direct PDF và FR-8 dừng sớm; sửa chỗ design system nói key ở SQLite (nếu giữ tài liệu này là nguồn tham khảo), README và runbook cho hành vi đã *thực sự* triển khai. Không viết tài liệu hiện trạng như đã hoàn tất khi chưa có code.
- [ ] `npm ci`, `npm run typecheck`, `npm test`, `npm run build` trên Node tương thích. `npm run lint` hiện hỏi cấu hình: thêm config lint non-interactive hoặc nêu rõ chưa chạy và lý do. Test route/unit, browser E2E (mobile/desktop), snapshot JSON và DB temp; phân loại lỗi ngoài phạm vi thay vì báo pass giả.
- [ ] Trên staging VPS có dữ liệu giả: chứng chỉ HTTPS và auth trước mọi route, chặn truy cập trực tiếp app port, Origin/CSRF (bao gồm DELETE/SSE), không cache CV/backup/raw; secrets không ở repo/image/log/DB; upload PDF 10 MiB và backup 50 MiB được giới hạn từ ingress tới API; SSE hoạt động qua proxy; 1 process/1 volume/không bỏ WAL/SHM khi sao lưu.
- [ ] Thực hiện backup → restore DB staging **mới** → đối chiếu 6 bảng; thử rollback từ backup lỗi; restart/redeploy giữ DB; thử mất proxy/chứng chỉ và rotate mật khẩu không biến backend thành public. Lưu runbook rollback ứng dụng/DB, retention, quyền file backup, restore drill định kỳ và cách phát hiện disk full.

**Cổng phát hành:** nếu bất kỳ bước P0 hoặc test backup/rollback/volume/SSE/key privacy chưa đạt, **không expose VPS ra Internet**. Trong giai đoạn viết ba file spec này không chạy lệnh deploy hay xác nhận các checkbox.

## Định nghĩa hoàn tất cho giai đoạn viết spec hiện tại

- [ ] Có đúng ba file Markdown [requirements](requirements.md), [design](design.md), [tasks](tasks.md) với liên kết hợp lệ và RQ-01..06 đối chiếu T-01..07.
- [ ] Không có application code, cấu hình deploy, DB thật hay README nào bị thay đổi chỉ để tạo spec. Chưa chạy test/build/deploy; mọi trạng thái ở backlog trên là mục tiêu tương lai.
