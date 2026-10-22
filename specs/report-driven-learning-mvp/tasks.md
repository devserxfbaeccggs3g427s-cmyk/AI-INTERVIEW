# Backlog triển khai — MVP học một mục từ báo cáo

> Trạng thái: **L-01 → L-04 xong; L-05 đã đối chiếu bố cục ba trạng thái Stitch và kiểm browser local ở 375px/desktop/vi/en, nhưng chưa kiểm bằng screen reader thật; L-06 chưa hoàn tất** · cập nhật 2026-10-22. Checkbox chỉ tick sau khi có code, test và bằng chứng thực tế.
> [Yêu cầu](requirements.md) · [Thiết kế](design.md) · [Backlog VPS](../interview-studio-improvements/tasks.md) · [Ba màn Stitch](../../stitch-screens/screens/06-learning-self-test.html)

## Nguyên tắc triển khai

Giữ nguyên vòng **báo cáo → luyện lại**; bổ sung một bước học cho **một** `improvements[i]` hoặc `next_steps[i]` được chọn. Hai cách học `fundamentals`/`answering` độc lập, không mở khóa theo thứ tự. **Chỉ tạo bài nếu cách học chưa có bài; bài ready không được tạo lại**; failed/stale claim chỉ retry khi người dùng bấm. Dùng provider/model/đích **của phiên gốc** với key BYOK được gửi riêng mỗi lần; không đổi sang provider hiện tại. Từng PR nêu RQ/D liên quan, migration/rollback, chi phí provider có thể phát sinh, biên dữ liệu nhạy cảm và kết quả kiểm chứng.

Mọi test SQLite cần `INTERVIEW_DB_PATH` **file tạm riêng trước khi import `lib/db.ts`**; không restore/wipe DB thật hoặc VPS production. Không phát hành schema mới một mình mà quên backup/restore dữ liệu học. Các trạng thái HTML chỉ tham khảo; không sao chép telemetry, nhãn model, code Redis “production safe”, tiến độ %, hoàn thành quiz hay tuyên bố bảo mật từ nội dung giả lập.

### L-01 — Hợp đồng nguồn đề xuất, bài học và quiz (P1) → RQ-L01,L02,L04; D-L01,L02

- [x] Tra session `completed` và `safeParseStoredReport()`; nhận `kind/index`, tính SHA-256 đúng bytes `report_json`, phân biệt phần tử trùng text, snapshot source nguyên bản có giới hạn. Không sửa report v1/chấm điểm. Có public DTO cho catalog một mục và bài học, không tiết lộ đáp án/giải thích trước nộp.
- [x] Schema Zod strict cho `fundamentals`/`answering`: title/goal/objectives/explanation/example/sections và 2–3 câu × 3 lựa chọn A/B/C, đáp án hợp lệ; giới hạn ký tự/UTF-8, renderer text/code an toàn. Không dùng full report/CV/transcript làm dữ liệu bài học.
- [x] Hàm chấm deterministic và validator attempt strict; test output rỗng/thiếu/thừa/cắt cụt, chủ đề không có code, tiếng vi/en, nội dung HTML/prompt injection, lựa chọn trùng/sai, câu hỏi 0–3 đúng và DTO không có key đáp án.

**Dự kiến:** `lib/learning-schema.ts`, `lib/learning.ts`, `lib/zod-schemas.ts` (chỉ dùng lại, không đổi v1), `lib/learning*.test.ts`, `lib/practice-prefill.ts` (tái sử dụng).  
**DoD:** fixtures report hợp lệ/trùng/mục không có/báo cáo hỏng xác định source đúng; serializing mọi GET/SSR trước khi nộp không làm lộ đáp án; bài chỉ chứa text/code đã escape.

### L-02 — Migration v3 và backup/restore đủ dữ liệu học (P1) → RQ-L01,L03,L04,L06; D-L03

- [x] Migration transaction v0/v1/v2→v3: `learning_lessons` và `learning_check_attempts`, FK cascade, CHECK, UNIQUE source×revision×mode và attempt idempotency, claim/status/snapshot provider không key. Test DDL lỗi rollback, unsupported future version, restart, xóa session/wipe.
- [x] Nâng `lib/backup.ts` từ 6→8 bảng/schemaVersion 3: cột explicit, validation strict, counts, FK/unique, thứ tự delete/insert, sequence, limit 50 MiB; import v1/v2 bằng schema cũ riêng rồi project bảng học rỗng. Tính nhất quán snapshot/restore replace/rollback và xử lý hoạt động provider đang bay qua maintenance gate. `/history` cập nhật số bảng và cảnh báo backup có bài, đáp án, nội dung report/PII.
- [x] Test v3 export→import DB mới→restart; v1/v2 import; malformed/orphan/duplicate/oversize/unknown column/key/claim bất hợp lệ, fail giữa transaction, wipe/cascade. Kiểm backup không chứa `api_key`/PDF bytes; không dùng DB `data/interview_sessions.db`.

**Dự kiến:** `lib/db.ts`, `lib/backup.ts`, `app/history/page.tsx`, `lib/backup*.test.ts`, test migration mới.  
**DoD:** export/import sau khi có bài + attempt giữ đủ 8 bảng và kết quả quiz; lỗi giữ DB cũ; có runbook backup DB nhất quán trước migration và rollback offline trên **bản sao volume**.

### L-03 — API tạo bài BYOK theo phiên gốc (P1) → RQ-L01,L02,L03,L06; D-L01,L03,L04

- [x] GET catalog chỉ trả một source hiện hành, revision, trạng thái hai mode và metadata lịch sử cũ; GET bài theo ID tách public DTO khỏi đáp án. POST tạo nhận revision/kind/index/mode/config, `x-api-key` per-request; kiểm Origin **trước** body/DB/provider, giới hạn bytes khi đọc stream, private/no-store/referrer. Dùng `enterOperation()` bao trọn await; return status rõ khi report cũ/bài ready/maintenance.
- [x] `parseModelConfig()` + `resolveSessionConfig()` khóa provider/model/đích custom của phiên phỏng vấn; provider disabled/mismatch/key thiếu trả lỗi hữu ích, không fallback; adapter custom vẫn kiểm SSRF. Prompt chỉ gồm role/language/mode/source ngắn, giới hạn input/output/time, một click một provider call, không auto retry có phí, schema strict trước commit, không lưu raw output/key/PII không cần thiết.
- [x] Claim UUID + TTL, duplicate/double-click/hai tab trả trạng thái đang tạo hay bài ready mà **không gọi AI lần hai**; retry failed/stale explicit, fence kết quả muộn; kiểm session/report revision/source/claim dưới transaction trước ghi. Request vượt timeout/cancel/mạng lỗi thành failed chỉ với claim còn hiệu lực; không bao giờ ghi bài nửa vời.

**Dự kiến:** `app/api/sessions/[id]/learning/route.ts`, `app/api/learning/[lessonId]/route.ts`, `lib/learning-generation.ts`, `lib/learning-constants.ts`, `lib/providers/session-config.ts` (reuse), `lib/origin-guard.ts` (reuse), tests route/provider với DB tạm.  
**DoD:** mỗi `(session,revision,kind,index,mode)` tối đa một bài ready bất biến; missing key, mismatch, disabled provider, custom URL xấu, timeout, output invalid, two tabs, stale claim, report thay/restore/xóa phiên có kết quả an toàn; không bấm tạo không có provider call.

### L-04 — Tự kiểm tra, lưu attempt và nạp lại (P1) → RQ-L02,L04,L06; D-L02,L03,L04

- [x] `GET /api/learning/:lessonId/checks`: trước attempt trả rỗng, không lộ đáp án; sau attempt trả history cùng giải thích để xem lại. `POST` validate `{clientAttemptId,answers}` đầy đủ, chấm server theo lesson JSON bất biến và lưu transaction; từ chối nộp cho bài chưa ready/thuộc report cũ.
- [x] Idempotency: same ID+answers trả kết quả cũ, same ID+answers khác 409; hai tab ID khác không mất attempt; tối đa 20 attempts/bài và hướng dẫn khi quá giới hạn. Sau nộp hiển thị “đúng x/y”, selected/correct/explanation; redo gắn nhãn **ôn tập sau khi đáp án đã lộ**, không gọi model, không reset lesson.
- [x] Test 0/y, giữa, y/y, bỏ câu, đáp án ngoài A/B/C, body thừa, concurrent submit, lần 20/21, reload/restart, hai mode độc lập, dữ liệu cũ chỉ đọc.

**Dự kiến:** `app/api/learning/[lessonId]/checks/route.ts`, `lib/learning.ts`, `lib/learning*.test.ts`.  
**DoD:** kết quả độc lập với provider, trước nộp không lộ đáp án qua GET/HTML; invalid POST không ghi, retry không nhân đôi lần thử.

### L-05 — UI một chủ đề theo ba mẫu Stitch và vòng luyện lại (P1) → RQ-L01..L05; D-L01,L02,L04

- [x] `/report/[id]` thêm CTA **“Học chủ đề này”** cạnh từng improvement/next_step, giữ CTA **“Luyện chủ đề này”**; link chỉ chứa session/kind/index. `/learn/[id]` một source, nút quay báo cáo, hai selector độc lập có semantic keyboard/aria và trạng thái riêng; không có sidebar liệt kê các mục khác.
- [x] Ánh xạ `06-learning-self-test-2.html` → nền tảng chưa tạo + nút tạo/cảnh báo phí; `06-learning-self-test-3.html` → nền tảng ready + quiz/kết quả thật; `06-learning-self-test.html` → luyện diễn đạt/đào sâu ready + quiz/kết quả thật. Thêm loading/error/retry/old revision; **loại bỏ** nút regenerate trong mock bài ready, các bản preview Redis giả/65%/100% passed/ETA và telemetry bảo mật không được chứng minh. Chỉ render nội dung từ provider đã validate hoặc empty state rõ.
  - `/learn/[id]` có ribbon cố định bên dưới TopBar, hero/callout nguồn thật, hai thẻ mode độc lập, empty state viền dashed/cảnh báo phí, ready banner/nội dung có phân cấp/quiz và feedback theo attempt thật. Bộ browser local kiểm cả ready `fundamentals` lẫn `answering` và uncreated, nhưng chưa có so sánh ảnh tự động. Font trang vẫn là Inter (shell toàn app), không tải Geist hoặc icon từ Stitch vào trang riêng.
- [ ] Luôn có CTA **“Luyện lại chủ đề này”** dùng `practiceFocusLabel()` + `encodePracticePrefill()` cho `/new` với một focus từ **source gốc**, fallback không focus khi không hợp lệ. Người dùng chỉnh focus/role, chọn CV rồi tự xác nhận tạo session; click không tự POST/gọi AI. Thử 375px, desktop, keyboard/focus/screen reader và ngôn ngữ vi/en.
  - Đã kiểm: CTA có href chỉ role/language/một focus gốc; `/new` nạp role/focus vào ô chỉnh sửa được và chọn đúng ngôn ngữ. Chrome đo `innerWidth=375`, `scrollWidth=367`, và 1280/1272; Tab đến control tương tác, hai ngôn ngữ và hai loại source. **Chưa kiểm bằng screen reader thật** (Chrome DOM/Tab không thay thế đọc màn hình), CV selection/submit phiên mới và so sánh ảnh tự động — chưa tick cả dòng.

**Dự kiến:** `app/report/[id]/page.tsx`, `app/learn/[id]/page.tsx`, `components/TopBar.tsx` (nếu điều hướng cần mở rộng), CSS/token hiện có, UI tests.  
**DoD:** từ hai loại nguồn đều đến đúng một mục; chuyển mode không mất nội dung/quiz/không gọi AI; chỉ uncreated có “Tạo”, failed có “Thử lại”, ready **không** có “Tạo/Tạo lại”; quay về `/new` có focus đã làm sạch và không đem CV/key/transcript.

### L-06 — Kiểm chứng tích hợp và cổng vận hành (P0 trước public) → mọi RQ; D-L05

- [ ] Node ≥22.5: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`; lint nếu được cấu hình không tương tác, nếu không ghi rõ chưa chạy. Đối chiếu traceability RQ ↔ D ↔ task và fixture/schema/API.
- [ ] Browser E2E desktop + 375px + keyboard/screen reader: report completed/invalid, improvement/next_step trùng chữ, hai mode, uncreated/loading/failed/ready/old revision, quiz trước/sau nộp/redo/reload, `/new` prefill và session mới. Mock-provider kiểm thiếu key, sai provider/model/destination, SSRF, timeout, output xấu, concurrent generate/restore/report đổi.
- [ ] Staging **chỉ dữ liệu giả**: HTTPS + auth ingress cho mọi page/API/assets/admin/backup, backend không public, thiếu/sai Origin bị từ chối trước provider, cache no-store/no-referrer; `DISABLE_ORIGIN_CHECK` tắt, custom URL SSRF giữ nguyên. Backup v3→restore DB khác→restart và offline rollback, kiểm WAL/SHM, SSE sau proxy. Chưa đạt T-01/T-07 [backlog VPS](../interview-studio-improvements/tasks.md) ⇒ **không public**.

**DoD:** checklist có kết quả thực và bước phục hồi, không tick nhờ spec hay unit tests đơn lẻ; ghi rõ test bị bỏ qua hoặc bị chặn bởi hạ tầng.

## Ma trận truy vết

| Yêu cầu | Thiết kế | Việc kiểm chứng |
|---|---|---|
| RQ-L01 | D-L01, D-L03, D-L04 | L-01,L-02,L-03,L-05,L-06 |
| RQ-L02 | D-L02, D-L04 | L-01,L-04,L-05,L-06 |
| RQ-L03 | D-L02, D-L03, D-L04 | L-02,L-03,L-05,L-06 |
| RQ-L04 | D-L02, D-L03, D-L04 | L-01,L-04,L-05,L-06 |
| RQ-L05 | D-L01, D-L04 | L-05,L-06 |
| RQ-L06 | D-L03, D-L04, D-L05 | L-02,L-03,L-04,L-06 |

**Hiện trạng xác thực:** mã L-01…L-05 đã có trong nhánh làm việc, chưa commit.

## Kết quả kiểm chứng (2026-10-22)

Chạy trên Node 24.13.1, DB tạm qua `INTERVIEW_DB_PATH`; **không** đụng `data/interview_sessions.db` hay volume production.

**Lệnh nền:** `npm run typecheck` sạch · `npm test` **80 network + 174 TypeScript = 254 pass / 0 fail** · `npm run build` thành công (có `/learn/[id]`, `/api/sessions/[id]/learning`, `/api/learning/[lessonId]`, `…/checks`) · `git diff --check` sạch · `mcp__idea__build_project` không lỗi. `npm run lint` **chưa chạy** — lệnh hỏi cấu hình tương tác.

**Bộ test học:** `learning-schema` 6/6 · `learning-source` 3/3 · `learning-generation` 20/20 · `learning-attempts` 8/8 · `backup` + `backup-restart` + `focus-migration` + `admin-backup` 23/23.

**HTTP thật** (`next dev`, `PUBLIC_ORIGIN` khớp, mock provider đếm lượt gọi): Origin lạ → 403 trước khi đọc body · revision cũ → 409 · lệch đích custom → 409 · body thừa field → 400 (strict) · POST hợp lệ → `ready` · GET lesson **không có** `correctOption`/`explanation` (chỉ `stem` + `options`) · GET checks trước nộp → `{"ok":true,"attempts":[]}` · content-type sai → 415 · đáp án `Z` → 400 · thiếu câu → 400 · nộp hợp lệ → 2/2 · lặp cùng `clientAttemptId` → trả lại đúng kết quả cũ không tạo dòng mới · cùng ID khác đáp án → 409 · lần 21 → 429 (đúng 20 dòng đã lưu) · thay report → slot cũ thành `uncreated`, bài cũ sang `older`, GET vẫn đọc được `oldRevision: true`, POST bị từ chối 409.

**Browser thật** (Chrome headless + CDP, DOM sau khi JS chạy): `/report/[id]` render đúng **5 "Học chủ đề này" + 5 "Luyện chủ đề này"** với URL `/learn/<session>?kind=…&index=…` riêng cho từng mục · `/learn/[id]` bấm **"Tạo bài học"** → sinh bài → hiện tiêu đề + quiz → **không** lộ đáp án trước nộp → trả lời 2 câu → "Nộp 2/2" → hiện `Đúng 2/2 · lần thử thứ 1`, giải thích mới hiện, lịch sử `Lần 1: đúng 2/2` · bài `oldRevision` không có nút "Tạo bài học"/"Nộp" · không có `dangerouslySetInnerHTML`, không có chuỗi Redis/65%/100%/ETA/telemetry.

**Sửa được phát hiện khi kiểm:** API `checks` trả attempt **tăng dần** (`ORDER BY created_at, rowid`) còn UI lấy `attempts[0]` làm "lần mới nhất" → đã đổi sang phần tử cuối và đảo danh sách lịch sử.

**Kiểm lại giao diện local sau chỉnh Stitch (2026-10-22):** `npx tsx scripts/verify-learning-browser.ts` PASS trên Chrome headless/CDP với DB file tạm riêng và mock custom-provider local; 2 cỡ viewport × 2 ngôn ngữ × 2 nguồn. Đo `innerWidth=375`, `scrollWidth=367` và desktop `1280/1272`; không tràn ngang. Kiểm hai mode, ready/uncreated, GET/DOM không lộ đáp án trước nộp, quiz nộp/lịch sử sau reload, Tab đến điều khiển, `/new` nạp role/focus chỉnh sửa được và ngôn ngữ; chỉ click tạo mới gọi mock provider đúng **một lần**, mở lại không gọi thêm; 0 lỗi JS browser. Phát hiện footer DB path dài gây tràn 375px và sửa `components/FooterBar.tsx` (wrap/break-all). `npm run typecheck`, `npm test` **80 network + 175 TypeScript = 255 pass / 0 fail**, `git diff --check`, IDE build sạch; `npm run build` **thành công trên bản sao cách ly** do checkout gốc có `next dev` dùng chung `.next` (build trực tiếp từng báo lỗi manifest cạnh tranh). Regression `lib/report-visibility.test.ts` bảo đảm lỗi refresh không giữ report/CTA cũ; ví dụ Compose trong `deploy/README.md` không publish backend port.

**Chưa kiểm được (không tick):**
- Screen reader thật và kiểm tương tác bằng Enter/Space toàn luồng — đã kiểm DOM semantics/Tab/radio trên Chrome, nhưng **chưa** có thiết bị/phần mềm hỗ trợ đọc màn hình xác nhận. Chưa có pixel-diff tự động đối chiếu ba ảnh Stitch; `app/layout.tsx` dùng Inter thay vì Geist.
- Browser chưa bao phủ failed/stale/old revision trong **bộ script mới**; hành vi old revision và retry/API đã kiểm bằng HTTP/đơn vị ở các mục phía trên, nhưng cần bổ sung E2E khi làm L-06. Chưa kiểm test tạo phiên mới từ `/new` sau khi chọn CV.
- `npm run lint`; `npm ci`.
- **L-06 chưa hoàn tất:** staging, ingress auth, HTTPS, restore-drill trên volume **riêng** chỉ có dữ liệu giả, offline rollback. Origin **không** phải là xác thực; chưa đạt T-01/T-07 ⇒ **không public**.
