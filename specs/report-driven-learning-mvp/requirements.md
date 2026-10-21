# Yêu cầu MVP — Học từ đề xuất trong báo cáo phỏng vấn

> Trạng thái: **đặc tả đề xuất, chưa triển khai** · 2026-10-21
> [Thiết kế](design.md) · [Backlog](tasks.md) · [FR/NFR gốc](../../stitch-screens/screens/00-requirements.md) · [Vòng luyện tập hiện có](../interview-studio-improvements/requirements.md)

## Bối cảnh và phạm vi

Báo cáo đã lưu có `improvements` (chuỗi) và `next_steps` (tiêu đề, mô tả, thời lượng) theo `EvaluationReportSchema` ở `lib/zod-schemas.ts`. Trang `/report/[id]` đã có nút **“Luyện chủ đề này”** dẫn tới `/new` với role, ngôn ngữ và focus có thể sửa. Đây là **đề xuất học dựa trên báo cáo sẵn có**, không phải roadmap được tạo trước phỏng vấn, không thay schema báo cáo v1 hay tự sắp xếp một roadmap mới. Bản thân lời khuyên AI có thể không chính xác; người dùng quyết định có học và có luyện lại hay không.

**Luồng mục tiêu:** hoàn thành phỏng vấn → xem báo cáo → chọn một mục cần cải thiện/bước tiếp theo → chọn “Học từ đầu” hoặc “Trả lời tốt hơn” → yêu cầu tạo *một* bài học → làm bài tự kiểm tra → quay lại học hoặc mở `/new` với focus để luyện phỏng vấn. Mở trang báo cáo, xem chủ đề hay chọn chế độ **không** gọi provider. Nội dung chỉ sinh sau khi người dùng bấm tạo bài và biết lần gọi BYOK có thể tốn phí.

**Ngoài phạm vi:** lộ trình đầu vào trước phỏng vấn, tạo hoặc xếp lại roadmap AI, học tự động tất cả các mục, OCR/PDF multimodal, chat gia sư liên tục, bài thực hành được AI chấm, spaced repetition, thống kê/khẳng định sự tiến bộ qua nhiều báo cáo, thay đổi logic chấm điểm hiện tại, tài khoản nhiều người dùng hoặc lưu key trên server. Không mặc định gửi lại CV/transcript/diagnostic raw cho tính năng học.

## Yêu cầu chức năng

### RQ-L01 — Chọn đề xuất từ báo cáo (P1)

- Chỉ báo cáo `completed` có JSON hợp lệ mới hiển thị đường học; thêm **“Học chủ đề này”** cạnh từng `improvements` và từng `next_steps`, không xóa hoặc đổi ý nghĩa CTA **“Luyện chủ đề này”** hiện có. Chưa có báo cáo, báo cáo hỏng, đang/đã lỗi đánh giá: không hiển thị lời khuyên/bài học giả; giữ luồng retry đánh giá hiện có.
- Khi chọn, hiển thị nguyên văn đề xuất và, với `next_steps`, mô tả/thời lượng như **ngữ cảnh tham khảo**. Không gửi lời khuyên ở URL; URL chỉ mang session ID + loại mục + chỉ số mục. Server tra lại báo cáo đã lưu, không tin text/role do browser gửi. Hai mục giống nội dung vẫn là hai mục độc lập nhờ loại và vị trí.
- Nếu báo cáo bị thay qua đánh giá lại, bài học/tiến độ cũ không được chuyển nhầm sang đề xuất mới. Hiển thị bài cũ là **thuộc phiên bản báo cáo trước** và cho phép mở bài mới từ bản hiện tại; không âm thầm tính bài cũ là đã học xong mục mới.

**Nghiệm thu:** click CTA không gọi provider, không POST hay tạo session; mục chọn đúng cả khi có hai nhãn trùng; URL không có CV, key, transcript, đoạn báo cáo; thay báo cáo làm mất trạng thái “đã học” trên mục hiện tại nhưng vẫn xem được lịch sử cũ của session còn tồn tại.

### RQ-L02 — Bài học hai mức, có quyền kiểm soát BYOK (P1)

- Người dùng chọn **“Học từ đầu”** (giải nghĩa, kiến thức nền, ví dụ nhỏ) hoặc **“Trả lời tốt hơn”** (cấu trúc trả lời, lập luận/đánh đổi, ví dụ trả lời phỏng vấn). Nội dung theo ngôn ngữ phiên, vai trò và đúng mục được chọn; nêu đây là nội dung AI tạo, có thể sai, không là chứng nhận năng lực.
- Bấm **“Tạo bài học”** mới gọi provider bằng cấu hình provider/model/đích custom của phiên gốc và API key BYOK cung cấp cho request này. Nếu key thiếu hoặc không khớp provider, hướng dẫn chọn lại provider/nhập key, không fallback ngầm sang provider khác hay gửi key tới endpoint mới. Trước nút gọi nêu rõ có thể phát sinh chi phí; hiển thị loading, hủy xem, lỗi thân thiện và thử lại có chủ đích.
- Mỗi bài ngắn gồm mục tiêu, giải thích, ví dụ, 2–3 câu tự kiểm tra có đáp án xác định và giải thích. Giới hạn kích thước đầu vào, đầu ra, thời gian và số lần tạo; output sai schema/quá dài/timeout không trở thành bài đã hoàn thành. Mở lại bài có sẵn không tự gọi AI; click đôi hoặc hai tab không tạo hai bài giống nhau.

**Nghiệm thu:** hai mode cho nội dung/mục tiêu phù hợp, độc lập; offline/thiếu key/disabled provider/generation lỗi không ghi bài hoàn chỉnh, có đường retry rõ; reload vẫn xem bài đã tạo không cần key; không có key trong SQLite/backup/URL/log/response.

### RQ-L03 — Tự kiểm tra và tiến độ trung thực (P1)

- Mỗi bài có 2–3 câu trắc nghiệm một lựa chọn, người dùng nộp sau khi chọn đủ đáp án. Trước nộp không gửi đáp án/giải thích đúng xuống browser qua API/HTML; chấm điểm **deterministic phía server** bằng đáp án đã validate. Sau nộp cho xem đúng/sai, đáp án và giải thích, lưu mỗi lần thử để quay lại xem. Cho phép làm lại như ôn tập sau khi đã thấy đáp án, **không** diễn giải lần sau như đánh giá độc lập.
- Trạng thái hiển thị tách bạch: `chưa tạo` → `đang tạo`/`tạo lỗi` → `đang học` → `đã tự kiểm tra`. Mục đã kiểm tra không đồng nghĩa “đã thành thạo”; hiển thị `đúng x/y` và số lần thử, không dùng một điểm AI như chứng cứ tiến bộ. Tạo một mode không tự đánh dấu mode còn lại.
- Bài học và tiến độ gắn với session, phiên bản báo cáo, mục đề xuất và mode; refresh/khởi động lại server không làm mất. Xóa session hoặc wipe dữ liệu xóa theo mọi bài học/attempt; backup/restore bảo toàn chúng.

**Nghiệm thu:** với đáp án đúng/sai/rỗng/ngoài phạm vi, kết quả chính xác, input xấu không ghi; hai tab nộp đồng thời không mất lần thử; reload và restore DB thử nghiệm giữ nguyên trạng thái; report khác hoặc bị thay không thừa hưởng tiến độ. Không hiển thị đáp án trong response trước nộp.

### RQ-L04 — Quay về luyện phỏng vấn (P1)

- Bài học có nút **“Luyện lại chủ đề này”**; mở `/new` với role/language và **một** focus đã làm sạch/giới hạn từ đề xuất gốc. Người dùng được sửa/bỏ focus, chọn CV và xác nhận tạo phiên theo quy trình đang có. Không tự đính kèm CV cũ, transcript, key hoặc tự POST tạo phiên; không bắt buộc làm bài kiểm tra trước khi luyện.
- Nếu đề xuất không chuyển được thành focus hợp lệ, hiện cảnh báo và cho phép mở `/new` không focus thay vì tạo URL hỏng. Không khẳng định prompt chắc chắn chỉ hỏi một chủ đề: focus hiện có là gợi ý ưu tiên, không là giáo trình bắt buộc.

**Nghiệm thu:** click không tạo session/gọi provider; URL chỉ có role/language/focus hợp lệ, không có dữ liệu nhạy cảm; người dùng chỉnh focus rồi mới tạo, session mới lưu đúng snapshot focus.

## Yêu cầu phi chức năng và cổng phát hành

- **NFR-L01 — Bảo mật & riêng tư:** single-owner, chưa có auth ở tầng app: mọi trang học/API/backup sau HTTPS + xác thực ingress, backend không public. Mutations phải kiểm `Origin` cấu hình **trước** parse body, DB, provider; mọi response nhạy cảm `private, no-store` và `no-referrer`. Chỉ truyền role + đề xuất đã lưu ngắn gọn + mode cho provider, coi text báo cáo là dữ liệu không tin cậy. Không dùng raw report body, CV, transcript hoặc key trong prompt/học liệu/URL ngoài dữ liệu được cho phép. `DISABLE_ORIGIN_CHECK` không bật trên VPS public; custom endpoint giữ chặn SSRF sẵn có.
- **NFR-L02 — Tính nhất quán & vận hành:** schema mới cần migration nguyên tử, backup JSON versioned chứa cả dữ liệu học và nhập được backup cũ; kiểm FK, giới hạn 50 MiB, rollback sạch khi lỗi; chỉ một process/volume SQLite theo ràng buộc hiện có. Provider đang gọi không giữ transaction DB; request lâu phải có timeout, fenced claim và không ghi nhầm khi restore/report đổi hoặc người dùng xóa session.
- **NFR-L03 — Truy cập và ngôn ngữ:** mobile 375px/desktop, điều hướng keyboard, label/`aria-live` cho async/loading/lỗi/kết quả, không chỉ dùng màu cho đúng-sai; UI tiếng Việt, nội dung bài theo `session.language` vi/en, gắn `lang` phù hợp cho khối tiếng Anh.
- **NFR-L04 — Minh bạch kiểm chứng:** test contract/schema, route trên DB tạm, mock provider, browser và staging ingress/backup. Không xem unit tests là chứng cứ đã kiểm tra browser/VPS. Trước khi public dùng dữ liệu thực phải hoàn tất cổng T-01/T-07 trong [backlog VPS, T-01/T-07](../interview-studio-improvements/tasks.md); tính năng học không thay thế cổng đó.

**Điều kiện hoàn tất MVP:** một người có báo cáo hợp lệ có thể học *một mục họ tự chọn* ở một trong hai mode, lưu/reload bài và lần tự kiểm tra, rồi chủ động tạo phiên luyện lại; session xóa/backup/restore không để lại hay làm mất dữ liệu học; không gọi model khi chỉ xem báo cáo và không tuyên bố người dùng đã thành thạo. Các trạng thái lỗi được thử và ghi nhận như trong [tasks.md](tasks.md).
