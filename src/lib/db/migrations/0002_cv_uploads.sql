-- CV đã tải lên, sống giữa `POST /upload` và `POST /start` — docs/02-DESIGN.md §7.4.
--
-- Vì sao cần bảng này mà không giữ trong RAM: hai endpoint là hai request riêng, và
-- một restart server giữa chúng sẽ xoá sạch mọi CV đã tải (xem FR-11 — tải lại trang
-- không được làm mất dữ liệu phiên).
--
-- `file_id` nằm ở đây chứ không ở `sessions`, vì `GET /api/sessions/[id]` trả nguyên
-- `SessionRecord` ra trình duyệt — đặt `file_id` vào `sessions` là lộ đúng thứ mà
-- §7.5 nói không được lộ.
--
-- `key_fingerprint` gắn lần tải với key đã dùng: `file_id` của hãng thuộc workspace
-- của key đó, nên dùng lại nó bằng key khác là đọc chéo tệp. 16 hex = 8 byte của
-- sha256, không phải key và không khôi phục được key (NFR-10).
--
-- Cả hai cột có thể cùng có giá trị: `/upload` không biết người dùng sẽ chọn `direct`
-- hay `extract` — lựa chọn đó nằm trong body của `/start` (§3.4) — nên tải lên một
-- lần và phục vụ cả hai đường. Ràng buộc chỉ chặn trường hợp *không* có gì dùng
-- được, để `start` không bao giờ nhận một hàng rỗng rồi âm thầm bỏ qua CV.
--
-- Hàng bị xoá khi hết hạn, hoặc sớm hơn khi `start` dùng xong — nhưng phiên vẫn giữ
-- `cv_upload_id` nên lượt sau dựng lại được khối CV từ text đã lưu trong `sessions`
-- (FR-18). Xem `docs/02-DESIGN.md` §7.4.

CREATE TABLE cv_uploads (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  -- Đường trích text: nội dung đã thành văn bản, sẵn sàng dựng khối CV.
  extracted_text TEXT,
  -- Đường đọc thẳng: tham chiếu file ở phía provider. KHÔNG trả ra ngoài server.
  file_id TEXT,
  key_fingerprint TEXT NOT NULL,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  CHECK (extracted_text IS NOT NULL OR file_id IS NOT NULL)
);

CREATE INDEX cv_uploads_expiry ON cv_uploads(expires_at);

-- Phiên chỉ giữ `upload_id`, **không** giữ `file_id` thô: `GET /api/sessions/[id]` trả
-- nguyên `SessionRecord` ra trình duyệt, nên đặt `file_id` vào `sessions` là lộ đúng
-- thứ §7.5 nói không được lộ. Đây là tham chiếu lịch sử, KHÔNG phải khóa ngoại:
-- `/start` xoá hàng CV ngay sau khi dùng. FK mặc định RESTRICT sẽ chặn thao tác xoá
-- (còn ON DELETE SET NULL sẽ đánh mất upload_id đã chọn).
ALTER TABLE sessions ADD COLUMN cv_upload_id TEXT;

CREATE INDEX sessions_cv_upload ON sessions(cv_upload_id);