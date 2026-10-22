# Yêu cầu MVP — Học từ một đề xuất trong báo cáo phỏng vấn

> Trạng thái: **đặc tả mục tiêu, chưa triển khai** · 2026-10-22  
> [Thiết kế](design.md) · [Backlog](tasks.md) · [FR/NFR gốc](../../stitch-screens/screens/00-requirements.md) · [Vòng luyện tập hiện có](../interview-studio-improvements/requirements.md)

## Bối cảnh và ranh giới sản phẩm

Báo cáo `v1` hiện có các `improvements` (chuỗi) và `next_steps` (tiêu đề, mô tả, thời lượng); trang báo cáo đã có CTA **“Luyện chủ đề này”** để mở `/new` với trọng tâm có thể chỉnh sửa. MVP thêm CTA **“Học chủ đề này”** riêng cho **từng** mục cải thiện và **từng** bước roadmap. Người dùng bấm mục nào thì chỉ học mục đó; muốn chọn mục khác thì quay lại báo cáo. Roadmap là **gợi ý**, không là chương trình học bắt buộc hay thước đo thành thạo. Giữ nguyên báo cáo và logic chấm điểm hiện tại.

Ba HTML Stitch là **tham khảo trạng thái/bố cục**, không phải giao diện đang chạy hay dữ liệu được kiểm chứng: [`06-learning-self-test-2.html`](../../stitch-screens/screens/06-learning-self-test-2.html) minh họa cách học nền tảng chưa có bài; [`06-learning-self-test-3.html`](../../stitch-screens/screens/06-learning-self-test-3.html) minh họa nền tảng đã có bài và kết quả tự kiểm tra; [`06-learning-self-test.html`](../../stitch-screens/screens/06-learning-self-test.html) minh họa luyện diễn đạt/đào sâu đã có bài. Nội dung Redis, nhãn model, “65%”, “SQLite Local Sync”, “Encrypted”, “Production Safe”, tỷ lệ đúng và thời gian/giá trong mock **không** phải cam kết của sản phẩm.

**Luồng mục tiêu:** hoàn tất phỏng vấn → xem báo cáo → chọn CTA học cạnh đúng một mục → xem mục gốc và hai cách học → chọn tự do cách nào cũng được → chỉ khi bấm **“Tạo bài học”** mới gọi AI → đọc bài và tự kiểm tra → tùy lúc mở `/new` để luyện lại chủ đề. Bài đã tạo mở lại từ dữ liệu đã lưu, không gọi AI. Một mục có thể học cả hai cách, chuyển qua lại không mất bài hay kết quả.

**Ngoài phạm vi MVP:** tạo roadmap mới/trước phỏng vấn, khóa bài theo thứ tự, danh sách tất cả chủ đề trên trang học, chat gia sư liên tục, AI chấm câu tự luận, chứng nhận thành thạo, thống kê tiến bộ liên báo cáo, spaced repetition, tạo lại bài **đã ready**, tự động đính kèm CV/transcript, tự động tạo phiên phỏng vấn, tài khoản nhiều người dùng, lưu provider key ở server hoặc hiển thị diagram/benchmark do AI tạo như sự thật đã kiểm định.

## RQ-L01 — Chọn đúng một mục từ báo cáo (P1)

- Mỗi phần tử `improvements[i]` và `next_steps[i]` của session `completed` có báo cáo hợp lệ có CTA **“Học chủ đề này”** riêng; CTA **“Luyện chủ đề này”** hiện có vẫn giữ nguyên ý nghĩa. Không đưa CTA học ở `strengths`, `per_turn`, báo cáo đang đánh giá/lỗi/hỏng hoặc phiên chưa có báo cáo; giữ luồng retry đánh giá hiện có.
- Trang học chỉ có **một** mục được chọn, nêu loại mục/vị trí, vai trò, nhãn hoặc nội dung gốc từ báo cáo và đường quay lại `/report/[id]`; không có sidebar/danh sách tổng hợp `improvements` và `next_steps`. Với `next_steps`, hiển thị `title`, `description`, `duration` gốc; với `improvements`, hiển thị chính chuỗi cải thiện. Không biến câu khuyên AI thành nhận định chắc chắn hoặc bịa thêm lời trích phỏng vấn không có trong chính mục này.
- URL chỉ chứa session ID, loại mục và chỉ số mục, không chứa prose của báo cáo, CV, transcript hoặc key. Server tra lại mục từ báo cáo đã lưu và xác định phiên bản báo cáo; hai mục trùng chữ nhưng khác loại/vị trí là hai mục độc lập. Khi báo cáo đổi sau đánh giá lại, bài và lần thử cũ không được tính vào mục thuộc phiên bản mới; nếu còn session, có thể mở bài cũ ở chế độ **chỉ xem** với nhãn “Từ báo cáo trước”, không âm thầm gắn vào mục mới.

**Nghiệm thu:** bấm CTA chỉ điều hướng, không POST/tạo session/gọi provider; cùng một nhãn ở hai vị trí vẫn mở đúng hai nguồn; URL không có dữ liệu nhạy cảm; báo cáo thiếu/hỏng không sinh mục giả; thay report không chuyển trạng thái “đã tự kiểm tra” sang report mới.

## RQ-L02 — Hai cách học độc lập, chọn không theo thứ tự (P1)

- Mỗi mục có đúng hai cách học: **“Chưa biết”** (`fundamentals`) giải thích nền tảng, khái niệm, cơ chế, ví dụ đơn giản; **“Luyện diễn đạt & Đào sâu”** (`answering`) hướng dẫn diễn đạt câu trả lời phỏng vấn, lập luận, tình huống/phản biện, đánh đổi và câu hỏi đào sâu. Bài sinh theo vai trò, ngôn ngữ phiên và đúng mục được chọn; tránh giả định người dùng luôn là Senior hay chủ đề luôn là Redis.
- Hai cách **đều mở sẵn**; không bắt hoàn thành cách này để mở cách kia, không bắt làm quiz trước khi luyện phỏng vấn. Bộ chọn luôn cho chuyển qua lại bằng chuột/bàn phím; bài, trạng thái tạo và lịch sử tự kiểm tra được lưu **riêng theo mục × cách học × phiên bản báo cáo**. Chuyển cách chỉ đổi nội dung hiển thị, không tạo/gọi provider/xóa bài đã có.
- Không đồng nhất “đã xem”, “đã có bài” hay “đã tự kiểm tra” với “đã thành thạo”. Thông báo nội dung AI tạo có thể sai; ví dụ code, các phát biểu kỹ thuật và số liệu nếu có chỉ là minh họa cần kiểm chứng, không gắn nhãn “production-safe” mặc định.

**Nghiệm thu:** một cách chưa tạo và cách kia đã có bài vẫn chuyển qua lại ngay; sau reload trạng thái mỗi cách đúng; làm quiz ở một cách không đánh dấu cách còn lại; không có thứ tự khóa hoặc danh sách nhiều chủ đề trên trang học.

## RQ-L03 — Chủ động tạo **một** bài cho mỗi cách học (P1)

- Với cách học **chưa có bài**, hiển thị **“Tạo bài học”** cùng cảnh báo có thể phát sinh phí API BYOK; mở trang/chuyển cách không tạo bài. Khi bấm mới gọi provider/model/đích custom **đã khóa trong phiên phỏng vấn gốc** bằng key BYOK do browser gửi trong request; thiếu key/không khớp provider/provider đã tắt phải báo rõ, không fallback sang cấu hình AI đang chọn hoặc nhà cung cấp khác. Không mặc định gửi CV, transcript, full report hoặc raw diagnostic cho tác vụ học.
- Trạng thái tạo: `chưa tạo → đang tạo → đã có bài` hoặc `tạo lỗi`. Chỉ hiện tiến trình không xác định (“Đang tạo…”), không báo `%`/ETA khi không đo được. Lỗi mạng, hết quota, timeout hoặc nội dung sai schema không lưu thành bài ready; thông báo an toàn và **“Thử lại”** có chủ đích, nêu khả năng một lần gọi trước đã phát sinh phí. Không tự gọi lại provider. Refresh hoặc rời trang trong lúc tạo không được gây hai lệnh tạo âm thầm.
- **Quyết định MVP:** bài `ready` là bất biến. Ở cách đã có bài chỉ hiện bài đã lưu, **không có nút “Tạo bài học” hay “Tạo lại bài học”**. Bấm đôi/hai tab/retry request cùng thao tác không tạo hai bài, không ghi đè bài ready; nếu trạng thái “đang tạo” bị treo sau crash, chỉ cho thử lại có chủ đích sau khi hết hạn claim. Có thể làm lại quiz mà không tạo lại bài.

**Nghiệm thu:** không có request provider khi chỉ xem/chọn cách; có key hợp lệ thì một lệnh tạo cho mục/cách/version tạo một bài; ready mở lại không cần key; lỗi để lại trạng thái cho retry rõ ràng; hai request đồng thời không nhân đôi chi phí do backend chủ động gọi hai lần; key không xuất hiện trong URL/DB/backup/log/response.

## RQ-L04 — Bài học và tự kiểm tra trung thực (P1)

- Mỗi bài ngắn, có mục tiêu, giải thích, ví dụ và phần phù hợp cách học: nền tảng có khái niệm/từng bước/ẩn dụ tùy chủ đề; luyện diễn đạt có cấu trúc trả lời, phản biện, đánh đổi và ví dụ câu trả lời. Chỉ hiển thị text/khối code đã escape, không chạy HTML/SVG/JavaScript do AI trả về. Nội dung và độ dài phải qua schema/giới hạn; không khẳng định mọi bài đều có diagram, code chạy production hay benchmark xác thực.
- Mỗi bài có **2–3 câu trắc nghiệm một lựa chọn**, mỗi câu ba phương án và một đáp án có giải thích. Trước khi nộp, browser không nhận đáp án đúng hoặc giải thích đáp án qua API/HTML; người dùng chọn đủ câu rồi nộp. Server chấm **deterministic** từ bài bất biến đã lưu, không gọi AI khi chấm. Sau nộp cho xem lựa chọn, đúng/sai, đáp án đúng, giải thích, tổng **đúng x/y**. Phân biệt “đã trả lời y/y” với “đúng x/y”, không tự gắn nhãn “đậu”/“thành thạo”.
- Lưu từng lần tự kiểm tra (số đúng, câu trả lời, thời gian), xem lại sau reload. Cho làm lại để ôn tập **sau khi đã thấy đáp án**, gắn nhãn không phải đánh giá độc lập; không reset hay thay đổi nội dung bài. Nộp lặp do mạng phải idempotent, hai tab không mất kết quả, input thiếu/thừa/sai lựa chọn không ghi attempt. Giới hạn số attempt/bài để tránh phình dữ liệu.

**Nghiệm thu:** 0/y, x/y, y/y đều chấm đúng; chưa nộp không thể lấy key đáp án từ GET/HTML; POST không hợp lệ không ghi; reload trả kết quả thật và lịch sử; quiz hai cách độc lập, làm lại không gọi provider/tạo bài mới.

## RQ-L05 — Quay lại vòng luyện phỏng vấn (P1)

- Nút **“Luyện lại chủ đề này”** luôn khả dụng (kể cả khi chưa tạo bài/quiz); dẫn sang `/new` với role, language và **một** focus ngắn đã làm sạch từ mục gốc. Người dùng xem/sửa/bỏ focus, chọn CV mới và tự xác nhận tạo phiên theo quy trình hiện có. Không tự lấy CV cũ, key, transcript; không POST tạo session khi chỉ click.
- Nếu mục không chuyển thành focus hợp lệ, giải thích trước khi điều hướng và cho mở `/new` không focus; nếu role cũng không hợp lệ thì về `/new` trống kèm hướng dẫn. Focus là ưu tiên câu hỏi, **không cam kết** phiên mới chỉ hỏi đúng chủ đề. Không dùng nội dung AI sinh trong bài để làm focus.

**Nghiệm thu:** click không gọi provider/không tạo phiên; URL chỉ có role/language/focus hợp lệ; người dùng chỉnh focus trước khi tạo, session mới lưu snapshot đã xác nhận; link “Luyện chủ đề này” cũ trên báo cáo vẫn hoạt động.

## RQ-L06 — Dữ liệu bền vững và bảo vệ truy cập (P1)

- Bài/attempt gắn session + phiên bản report + loại/vị trí mục + cách học, tồn tại qua reload/restart, xóa theo session khi xóa/wipe. Backup JSON versioned xuất/nhập đủ dữ liệu học và bài tự kiểm tra, đọc được backup cũ không có bảng học; restore lỗi phải rollback toàn bộ. Backup chứa bài học, lời khuyên gốc, đáp án và có thể có PII: cảnh báo trước tải/lưu/khôi phục.
- Ứng dụng hiện là single-owner **không có auth trong app**; trang học, API, admin/backup và tài nguyên phải qua HTTPS + xác thực ingress khi public. Mutation kiểm Origin chính xác trước đọc body/tác động DB/provider; response riêng tư `private, no-store` và `no-referrer`. Không coi Origin, session ID hoặc key provider là xác thực người dùng; custom endpoint tiếp tục bị chặn SSRF theo chính sách hiện có. Chỉ một process/volume SQLite hoặc cần cơ chế điều phối khác trước khi nhân bản.
- UI tiếng Việt, bài theo `session.language` (vi/en), có nhãn ngôn ngữ cho nội dung tiếng Anh. 375px/desktop dùng được bằng touch và bàn phím; loading/lỗi/kết quả được thông báo cho screen reader; không chỉ dùng màu để chỉ trạng thái hoặc đúng/sai. Không hiện trạng thái sync, mã topic ngẫu tạo, encryption/latency/cost hay tiến độ phần trăm giả như trong HTML tham khảo.

**Nghiệm thu:** xóa session/wipe xóa lesson + attempt; backup→restore DB test→restart giữ bài/quiz, nhập backup v1/v2 tạo dữ liệu học rỗng; lỗi import không đổi DB; sai/thiếu Origin không gọi AI/ghi DB; GET không cache; không xuất key; staging chỉ public sau cổng bảo vệ/backup trong [backlog VPS](../interview-studio-improvements/tasks.md).

## Cổng phát hành và kiểm chứng

Trước khi đánh dấu MVP hoàn tất: kiểm thử schema/route/SQLite tạm và mock provider; chạy `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`; thử browser desktop/375px/bàn phím cho cả ba trạng thái tham khảo (và trạng thái tạo lỗi), làm quiz trước/sau reload, report thay, hai tab và quay về `/new`. Trên staging dữ liệu giả phải thử ingress HTTPS/auth cho mọi page/API, Origin/no-store, backup→restore/rollback, restart và SSE phỏng vấn. `npm run lint` hiện có thể hỏi cấu hình do thiếu ESLint config; không được ghi “đã qua lint” nếu chưa chạy được. Bộ spec này **không xác nhận** bất kỳ kiểm thử hoặc triển khai nào đã hoàn tất.
