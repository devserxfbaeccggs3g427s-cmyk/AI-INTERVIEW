# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Trạng thái repo

Giai đoạn 0 xong: khung Next.js đã dựng, **chưa có mã nguồn tính năng**. Thư mục `src/` hiện chỉ có `app/layout.tsx` + `app/page.tsx` làm chỗ trình diễn.

**Repo đã `git init` nhưng chưa commit gì.** Tệp bị loại trừ: `.next/`, `node_modules/`, `.idea/`, `.claude/`, `*.tsbuildinfo`, `next-env.d.ts`, `.env*`.

## Lệnh

```bash
npm run dev         # http://localhost:3000
npm run build
npm start
npm run typecheck   # tsc --noEmit
```

Không có `lint` — Next 16 đã gỡ `next lint`. Không có test framework.

`npm run typecheck` phải chạy sạch **trên bản sao mới**, tức là sau `rm -rf .next`. Lý do ở mục dưới.

## Next 16 — đừng tin trí nhớ

Phiên bản đang dùng là **Next 16.4.1**, không phải Next 15 mà kiến thức cũ mô tả. Ba điều đã kiểm chứng từ tài liệu đi kèm:

- **`dynamic`, `dynamicParams`, `revalidate`, `fetchCache` bị gỡ** khi bật Cache Components. `next.config.ts` đang bật `cacheComponents: true`, nên **không khai báo `dynamic = "force-dynamic"` trong route handler** — sẽ bị yêu cầu gỡ.
- **`export const runtime` không còn cần**; tài liệu nói thẳng là bỏ đi. `maxDuration` thì vẫn hợp lệ, tính bằng giây.
- **`middleware.js` đã đổi tên thành `proxy.js`**, runtime là Nodejs và không cấu hình được.

Tài liệu nằm ngay trong `node_modules/next/dist/docs/` — **đọc file đó, đừng đoán**. Tài liệu có chỗ mâu thuẫn: trang `route.md` vẫn minh hoạ `export const dynamic` trong bảng segment config, nhưng bảng đó stale so với ghi chú Cache Components.

## Kiểu do Next sinh ra — đừng dùng ở bản sao mới

Next sinh `LayoutProps<"/">`, `PageProps<"/…">`, `RouteContext<'/…'>` vào `.next/types/` **sau khi build**. Bản scaffold mặc định viết `LayoutProps<"/">` trong `layout.tsx`, khiến `npm run typecheck` lỗi `TS2304` trên bản sao chưa build.

`src/app/layout.tsx` đã dùng `Readonly<{ children: ReactNode }>` để tránh điều đó. **Đừng đổi lại.** Cần `RouteContext` thì chạy `next typegen` trước, hoặc khai báo kiểu thủ công.

## Spec là nguồn sự thật

Ba file trong `docs/`, viết bằng **tiếng Việt** (giữ nguyên thuật ngữ kỹ thuật tiếng Anh):

| File | Phạm vi |
|---|---|
| `docs/01-REQUIREMENTS.md` | FR-1…FR-17, NFR-1…NFR-9, ngoài phạm vi, bảng quyết định |
| `docs/02-DESIGN.md` | Kiến trúc, lớp provider, API surface, bảo mật, chi phí |
| `docs/03-TASKS.md` | Giai đoạn 0 → 5, mỗi task có tiêu chí hoàn thành + cột `FR` |

**Ba file này cố ý tách bạch — đừng gộp về một `SPEC.md`.** Người dùng đã yêu cầu điều đó rõ ràng.

Quy ước khi sửa spec:

- Mọi `FR`/`NFR` phải có **ít nhất một task** trong `03-TASKS.md` trỏ tới. Thêm yêu cầu mà không thêm task là trạng thái không hoàn chỉnh.
- Tiêu chí hoàn thành phải **kiểm chứng được** — nhìn thấy là xong hay chưa, không phải cảm nhận.
- Không thêm tính năng ngoài phạm vi đã chốt; `01` §4 liệt kê những thứ bị loại và lý do.

## Kiến trúc (đọc `docs/02-DESIGN.md` §1–§4 và §8.1 trước khi viết code)

Ứng dụng luyện phỏng vấn bằng AI, **BYOK**: người dùng tự dán API key, không có key dùng chung, không cần đăng nhập.

Máy chủ giữ dữ liệu phiên trong **một file SQLite** (`data/app.db`), driver `node:sqlite`. Client chỉ giữ API key trong `localStorage`. Chi tiết ở `docs/02-DESIGN.md` §2.5–§2.6 và §8.1.

**Mọi lời gọi model đi qua một interface duy nhất `ProviderAdapter`** (`src/lib/providers/`). Route handler không biết đang nói với hãng nào. Adapter bốn hãng: Anthropic, OpenAI, Gemini, và OpenAI-compatible tùy chỉnh.

Điều dễ hiểu sai nhất: **tối ưu cho một hãng không chuyển sang hãng khác.** Mỗi adapter phải khai báo `capabilities` đúng với API thật của hãng đó, và ứng dụng **hạ tính năng** khi thiếu — không giả vờ mọi provider giống nhau. Thêm một provider mới = một adapter + một hàng trong ma trận năng lực.

### Ràng buộc phải giữ khi viết code

| Ràng buộc | Nội dung |
|---|---|
| **Phân tách client/server** | Chỉ route handler được import `src/lib/` (kể cả `src/lib/providers/`). Không component nào import SDK của bất kỳ hãng nào — đó là điều kiện để key không lọt vào bundle trình duyệt. |
| **Key** | Truyền qua **header**, không phải body hay query string. Không đọc từ `process.env` trong đường sản phẩn — nếu không, người quên dán key sẽ âm thầm dùng key của chủ dự án. `localStorage` là bản rõ **văn bản thuần**, UI phải nói rõ điều đó. |
| **Prompt lõi** | String literal bất biến. Không nội suy, không timestamp, không mã phiên. |
| **Lịch sử hội thoại** | Chỉ **append**, không sửa/cắt/nén. Trên Anthropic, khởi dựng lại lịch sử từ text thay vì giữ nguyên khối thinking sẽ viết lại toàn bộ cache mỗi lượt. |
| **Số lượt** | Server tự đếm từ transcript. Request không có trường `turnCount`. |
| **CV** | Kiểm tra magic bytes, không tin `Content-Type` của trình duyệt. Không render bằng `dangerouslySetInnerHTML`. Không ghi nội dung CV vào log. |
| **SQLite** | Driver `node:sqlite` — builtin của Node, **không** thêm dependency. Chạy WAL + `busy_timeout`. Migration theo `PRAGMA user_version`, không rải `CREATE TABLE` trong code. Transcript **chỉ append** (`UNIQUE (session_id, seq)`). API key **không bao giờ** vào DB. |
| **`await io()`** | Mọi hàm đọc DB bắt đầu bằng `await io()`. Thiếu nó, `GET` bị **đóng băng lúc build** và trả dữ liệu rỗng *mà không báo lỗi*. |

### Ba lỗi thất bại **im lặng**

Cả ba đều không báo lỗi, request vẫn thành công, không ai nhận ra — vì vậy có task xác minh riêng cho từng cái (`T-5.2`, `T-5.6`, `T-0c.6`):

1. **Hỏng cache** → hóa đơn tăng gấp rưỡi mỗi lượt.
2. **Thoát SSRF qua custom base URL** → server tự gọi vào mạng nội bộ của bạn.

Có một lỗi thứ ba cùng loại, do quyết định chuyển sang SQLite:

3. **Endpoint `GET` bị prerender** → build vẫn xanh, request vẫn 200, danh sách phiên **rỗng**. Driver SQLite đồng bộ không tự chặn prerender trong Next 16 — tài liệu `io.md` nói rõ phải `await io()` (`T-0c.6`).

Với custom provider: **nếu `outbound-guard.ts` chưa hoàn chỉnh thì tắt hẳn ở chế độ qua server.** Đây là quyết định bảo mật, không phải tối ưu trải nghiệm.

## Ràng buộc API Anthropic — sai là trả 400

Adapter Anthropic phải theo đúng (`docs/02-DESIGN.md` §12.1). Những thứ dưới đây **trả về lỗi 400** nếu viết sai:

- Model ID: `claude-opus-5`, **không** thêm hậu tố ngày.
- `thinking: {type: "adaptive"}` — `budget_tokens` đã bị gỡ.
- `temperature` / `top_p` / `top_k` đã bị gỡ — dùng `output_config.effort`, và nó nằm **bên trong** `output_config`, không phải tham số cấp cao nhất.
- Không dùng assistant prefill.
- Files API đã ra khỏi beta: `client.files.*`, không beta header.
- Kiểm tra điều kiện dừng **trước** khi đọc nội dung.
- Streaming: `client.messages.stream()` + `.finalMessage()`.

**Đừng suy adapter của hãng khác từ bảng trên.** Mỗi hãng dùng tham số riêng. Riêng adapter OpenAI/Gemini/Custom, `docs/02-DESIGN.md` §12.2 yêu cầu viết theo **tài liệu chính thức của hãng, không theo trí nhớ** — đúng những tên tham số này thay đổi nhanh, và bản nháp viết từ trí nhớ chạy được với một model rồi hỏng ở model khác.

## Điểm chưa xác minh

`docs/02-DESIGN.md` §12.2 và §12.3 liệt kê những thứ còn phải kiểm chứng lúc triển khai. Khi chạm tới chúng, kiểm tra lại thay vì giả định — mỗi mục đều có đường lùi đã ghi sẵn.