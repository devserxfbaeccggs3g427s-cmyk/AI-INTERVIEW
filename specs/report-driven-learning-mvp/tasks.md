# Backlog triển khai — MVP học từ báo cáo

> Trạng thái: **chưa triển khai bất kỳ task nào** · 2026-10-21. Checkbox chỉ được tick sau khi có code, test và bằng chứng thực tế.
> [Yêu cầu](requirements.md) · [Thiết kế](design.md) · [Backlog VPS hiện có](../interview-studio-improvements/tasks.md)

## Phạm vi và thứ tự

Không xây roadmap trước phỏng vấn: học từng `improvements`/`next_steps` đã có trong báo cáo và giữ nguyên CTA luyện tập hiện tại. Mỗi PR nêu RQ/D liên quan, migration/rollback, kiểm thử, giới hạn phạm vi và rủi ro key/CV. Test SQLite dùng **DB tạm riêng** (`INTERVIEW_DB_PATH` trước khi import `lib/db.ts`), tuyệt đối không chạy restore/wipe trên `data/interview_sessions.db` hay VPS thật. Cần hoàn thành L-01→L-05 trước nghiệm thu L-06; backup/restore phải hỗ trợ bảng học ngay trước khi lưu dữ liệu thật, không phát hành migration nửa chừng.

### L-01 — Hợp đồng bài học và nguồn đề xuất (P1) → RQ-L01,L02,L03; D-L01,L02

- [ ] Chuẩn hóa `kind/index/revision/mode` từ session completed + `safeParseStoredReport()`, digest đúng bytes report_json, snapshot label/context an toàn, xác thực index trong array, xử lý mục trùng text và report đổi sau upsert. Không đổi report v1/logic đánh giá.
- [ ] Zod strict bài học JSON phiên bản 1, 2–3 câu × 3 lựa chọn A/B/C và đáp án hợp lệ; mapper **public DTO không đáp án**; matcher deterministic/score; test mode vi/en, HTML/control/prompt injection, output quá dài/sai/truncated, bài rỗng, case đúng/sai 0/3 và 3/3.

**Đụng tới:** `lib/zod-schemas.ts` (chỉ thêm schema riêng hoặc `lib/learning-schema.ts`), `lib/practice-prefill.ts` (reuse helper, không thay logic có sẵn), `lib/evaluation.ts` (đọc cách upsert, không buộc sửa), `lib/learning*.test.ts`.
**DoD:** fixture báo cáo hợp lệ tạo đúng source identity; báo cáo pending/invalid/mục không tồn tại không được giả là lời khuyên; không response nào của GET mới tiết lộ đáp án trước lần nộp.

### L-02 — Migration v3 và backup/restore trọn vẹn (P1) → RQ-L01,L03; D-L03,L05

- [ ] Migration nguyên tử v0/v1/v2→v3: `learning_lessons` + `learning_check_attempts` với FK cascade, uniqueness source/mode/revision và attempt idempotency, claim/status/timestamps/index, snapshot provider/model/custom đích không có key cho retry. Test migration lỗi rollback schema và dữ liệu, v2 thật giả lập, unsupported future version, xóa session/wipe/restart.
- [ ] Nâng `lib/backup.ts`: export v3 **8 bảng** + counts/fingerprint/ordering/FK/sequence, strict schema; nhập v1/v2 theo schema cũ rồi điền 2 bảng rỗng, không nới validator để nhận field lạ; giới hạn 50 MiB trên upload/export, restore transaction không partial. UI `/history` hiển thị count và cảnh báo dữ liệu học/đáp án.
- [ ] Test v3 backup→restore→restart, import v1/v2, duplicate/orphan/unknown table/key/oversize và lỗi ghi giữa transaction; xóa/wipe xóa hết dữ liệu học; validation/commit restore chống DB đổi giữa hai bước. Xác minh không `api_key`/PDF bytes trong backup.

**Đụng tới:** `lib/db.ts`, `lib/backup.ts`, `app/history/page.tsx`, `lib/backup*.test.ts`, `lib/focus-migration.test.ts` hoặc test migration mới.
**DoD:** backup cả bài học/attempt, số hàng đúng sau restore; lỗi không đổi DB cũ; rollback app v2 là offline restore DB v2 trước migration trên **bản sao volume**, không tự down-migrate.

### L-03 — Sinh bài học chủ động, BYOK per-request (P1) → RQ-L01,L02; D-L01,L03,L04

- [ ] `GET /api/sessions/:id/learning` trả catalog/current revision và trạng thái tối thiểu, không CV/transcript; POST nhận revision/kind/index/mode và config phiên gốc, không nhận prose. Origin guard trước parse; body stream có byte limit, lease qua mọi `await`; private/no-store cho GET/POST. Source/claim kiểm tra lại trên server.
- [ ] Provider adapter `getProvider().streamChat()` với key `x-api-key`, `resolveSessionConfig()` khóa provider/model/custom Base URL; xây prompt có biên dữ liệu không tin cậy, không lấy toàn report/CV/transcript. Một lần gọi theo nút; giới hạn 60s, 2.500 tokens và 16 KiB response, abort/timeout; validate JSON strict trước commit; lỗi an toàn không log raw/key/PII. Không fallback provider/auto retry tốn phí.
- [ ] Claim ID + TTL, double-click/2 tab chỉ một call, retry thất bại/stale có thao tác rõ, commit compare-and-swap claim + revision, không ghi kết quả muộn sau report đổi/xóa session/restore. Trả 409 tương ứng; không giữ transaction qua provider.

**Đụng tới:** `app/api/sessions/[id]/learning/route.ts` (mới), `lib/learning.ts` / `lib/learning-generation.ts` (mới), `lib/providers/session-config.ts` và `lib/origin-guard.ts` (tái sử dụng), tests mock provider và DB tạm.
**DoD:** thành công chỉ lưu một bài ready/mode/item/revision; lỗi/timeout giữ trạng thái thử lại minh bạch; hai request đồng thời, stale claim, restore/report đổi không duplicate/corrupt; không key trong DB, URL, lỗi hoặc backup.

### L-04 — Tự kiểm tra, lịch sử và tiến độ (P1) → RQ-L03; D-L02..04

- [ ] `GET /api/learning/:lessonId` trả bài học/attempt summary không đáp án trước nộp; `GET /api/learning/:lessonId/checks` chỉ cung cấp lại lịch sử/kết quả/giải thích sau khi DB đã có lần nộp hợp lệ để reload xem được, không tiết lộ cho bài chưa nộp. Không trả `lesson_json` trực tiếp.
- [ ] `POST /api/learning/:lessonId/checks` validation strict `{clientAttemptId,answers}`; deterministic chấm trong transaction, tối đa 20 attempts, idempotency khi retry cùng ID (nội dung khác phải 409), đúng/sai + đáp án/giải thích chỉ sau nộp; bảo vệ Origin/maintenance/no-store. Old revision chỉ đọc nếu đã thay report.
- [ ] Test duplicate/replay/different payload, hai tab, chưa chọn đủ hoặc answer lạ, boundary lần 20/21, reload/restart, xóa parent cascade và bản cũ không đè tiến độ bản mới.

**Đụng tới:** `app/api/learning/[lessonId]/route.ts`, `app/api/learning/[lessonId]/checks/route.ts` (GET + POST); `lib/learning*.ts` + tests.
**DoD:** điểm và trạng thái chỉ phản ánh lần tự kiểm tra thật, không dùng từ “thành thạo” hoặc đánh giá độc lập sau khi đáp án đã lộ.

### L-05 — UI report → học → luyện lại (P1) → RQ-L01..04; D-L04

- [ ] Thêm CTA “Học chủ đề này” riêng cạnh “Luyện chủ đề này” ở `/report/[id]` cho improvements và next_steps; link chỉ mang kind/index/session ID, không gửi prose/CV/key. Trang `/learn/[id]` chọn mode, mô tả phí có thể phát sinh, bấm tạo mới gọi provider; có trạng thái chưa tạo/đang tạo/lỗi/ready/đã tự kiểm tra, old revision, thử lại và liên kết về báo cáo.
- [ ] Giao diện bài học vi/en, self-check không đáp án trước nộp, đáp án + giải thích sau nộp, lịch sử và lựa chọn làm lại có nhãn ôn tập; thông báo screen reader và bàn phím/mobile 375 px.
- [ ] “Luyện lại chủ đề này” dùng `practiceFocusLabel` + `encodePracticePrefill` tới `/new`; người dùng chỉnh rồi xác nhận, không POST tạo phiên tự động, không tự chép CV cũ. Fallback `/new` với role/language nhưng không focus khi label vô hiệu; nếu role cũng vô hiệu, `/new` trống kèm giải thích.

**Đụng tới:** `app/report/[id]/page.tsx`, `app/learn/[id]/page.tsx` (mới), `lib/practice-prefill.ts` (reuse), `app/new/page.tsx` (chỉ nếu cần UX liên kết, không thay nguồn focus).
**DoD:** sau reload vẫn thấy bài/tiến độ; hai mode độc lập, bài cũ đánh dấu lịch sử; click CTA không tạo bài/session; focus mới đúng snapshot đã xem/sửa. Kiểm a11y bằng keyboard và screen reader, không chỉ typecheck.

### L-06 — Nghiệm thu và cổng vận hành (P0 trước public) → mọi RQ; D-L05

- [ ] Trên Node ≥22.5: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`; `npm run lint` hiện hỏi cấu hình nên thêm ESLint config không tương tác hoặc báo rõ chưa chạy. Mock-provider test lỗi key/model/destination, prompt injection, timeout/output invalid, double call/cancel/retry, stale report/restore.
- [ ] Browser E2E desktop + 375 px, keyboard/screen reader: report valid/invalid, chọn đúng source có text trùng, mode, lesson, self-check, reload, revision cũ, retry, prefill `/new` và session mới. Ghi rõ phần không kiểm được thay vì tick giả.
- [ ] Staging **dữ liệu giả**: HTTPS + ingress auth toàn bộ page/API/assets, backend port không public, Origin thiếu/sai bị từ chối trước provider, response no-store/no-referrer; custom SSRF không bị nới, `DISABLE_ORIGIN_CHECK` tắt. Backup v3→restore DB khác→restart/rollback, WAL/SHM/volume; SSE phỏng vấn vẫn qua proxy. Nếu T-01/T-07 VPS chưa qua, **không phát hành public**.

**Đụng tới:** tests/CI docs/`deploy/README.md`/`README.md`/backlog VPS sau khi đã có bằng chứng; không coi bản spec này như bằng chứng đã deploy.
**DoD:** checklist kèm kết quả thật, liên kết logs redacted/biên bản smoke và phương án khôi phục; chỉ tick khi kiểm chứng đạt, giữ mở nếu hạ tầng staging chưa có.

## Ma trận truy vết

| Yêu cầu | Thiết kế | Task kiểm chứng |
|---|---|---|
| RQ-L01 | D-L01, D-L03, D-L04 | L-01, L-02, L-03, L-05, L-06 |
| RQ-L02 | D-L02, D-L03, D-L04 | L-01, L-03, L-05, L-06 |
| RQ-L03 | D-L02, D-L03, D-L05 | L-01, L-02, L-04, L-05, L-06 |
| RQ-L04 | D-L04 | L-05, L-06 |
| NFR-L01..04 | D-L03..05 | L-02..L-06 |

**Hiện trạng xác thực:** mới có ba tài liệu đặc tả; mọi mục trên là việc tương lai, chưa chạy test/build/browser/staging hay migration/backup dữ liệu thật.
