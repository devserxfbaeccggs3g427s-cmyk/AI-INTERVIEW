# Mock Interview — Tự đánh giá kỹ năng chuyên môn

> **Màn hình:** S16 (`/interview/setup`), S17 (`/interview/session`), S18 (`/interview/[id]`) · **Phase:** 1
> **Nguồn:** `system-design/SPEC.md` §2.8 (FR-MI-01…FR-MI-14), §3.2 (S16–S18), §4 (`InterviewProfile`/`InterviewSession`/`InterviewTurn`), §5.1 (AI-11/12/13), §5.4 (rubric), §8 (AC-9, AC-10, AC-13), §10 (Q6)
> **Prototype:** `system-design/s16_mock_interview_c_u_h_nh/`, `system-design/s17_mock_interview_phi_n_ph_ng_v_n/`, `system-design/s18_mock_interview_b_o_c_o_k_t_qu/`
> **Phụ thuộc:** `daily-loop-core`, `skill-tree-evidence`, `ai-foundation`

## 1. Tổng quan

Mock Interview là **tính năng quan trọng nhất của app** vì nó biến "theo dõi tiến độ" thành **"đo được"**. `Evidence` từ các hoạt động hằng ngày chỉ chứng minh *bạn đã làm gì*, không chứng minh *bạn giỏi đến đâu*. Chỉ một bài phỏng vấn có rubric cố định mới trả lời được câu hỏi đó.

Ba màn hình tạo thành một vòng đo duy nhất:

| Màn hình | Câu hỏi trả lời | Đầu ra |
|---|---|---|
| **S16 — Cấu hình** | *"Hỏi tôi về cái gì?"* | `InterviewProfile` + cấu hình phiên → `InterviewSession` (status `active`) |
| **S17 — Phiên** | *"Tôi trả lời thế nào, và AI hỏi tiếp ra sao?"* | Chuỗi `InterviewTurn` — mỗi lượt = 1 câu + 1 câu trả lời + điểm rubric + câu hỏi kế tiếp |
| **S18 — Kết quả** | *"Tôi đã tiến bao xa, yếu chỗ nào?"* | 1 `Activity` + 1 `Evidence` + 3 mạnh / 3 yếu + đề xuất luyện |

Nguyên tắc bất di bất dịch áp dụng:

- **P3 — Tiến độ = bằng chứng.** Phiên mock interview tạo ra đúng **1 `Evidence`** gắn với `Skill` trọng tâm nhất. Một phiên là một bằng chứng thật, không phải con số "% hoàn thành".
- **P4 — AI chấm theo rubric cố định.** AI-12 và AI-13 **không được** tự nghĩ tiêu chí. Rubric kỹ thuật 5 tiêu chí và rubric hành vi 4 tiêu chí là hằng số trong `src/lib/prompts.ts`.
- **P6 — Local-first.** Toàn bộ hội thoại, điểm và báo cáo nằm trong SQLite. Chỉ lúc người dùng bấm "Bắt đầu"/"Gửi câu trả lời" mới nội dung đi lên API.
- **P7 — Không vanity metric.** S18 **không** hiển thị "tổng giờ phỏng vấn", "phân vị ứng viên", "độ tin cậy dữ liệu 98.4%" (những thứ có trong prototype) vì chúng không truy được về `Skill` cụ thể nào. Mọi con số trên S18 phải trả lời được: *số này đo cái gì, để làm gì?*

**Chi phí (SPEC §2.8.3):** 1 phiên 8 câu = **9 call**. Nhờ prompt caching (hồ sơ vai trò + rubric là prefix cố định) và lịch sử chỉ **append**, ước tính **~$0.15–0.30 / phiên**. 2 phiên/tuần ≈ **$1–2.5/tháng**. Đây là tính năng **rẻ nhất** dù giá trị cao nhất.

---

## 2. Bối cảnh & vấn đề

- **Không có bài kiểm tra nào đo bạn đã tiến bao xa.** SPEC §2.8 mở đầu bằng đúng câu này: `Evidence` chỉ là bằng chứng năng lực, không có bài kiểm tra nào đo bạn đã tiến bao xa. Cây kỹ năng S03/S04 hiển thị level tăng theo số bằng chứng — nhưng level tăng ≠ năng lực tăng, và người dùng không có cách nào kiểm chứng.
- **AI hỏi câu chung chung thì không đo được gì (rủi ro R8).** "Giải thích cách hoạt động của hệ phân tán" cho mọi người là câu hỏi trang trí. Bắt buộc truyền `focusSkills` + `jobTitle` + `seniority` vào prompt và sinh câu hỏi theo đúng node kỹ năng cụ thể.
- **Điểm không ổn định thì mất niềm tin (rủi ro R9).** Cùng một câu trả lời, hai lần chấm khác nhau là thảm họa với tính năng "đo". Giảm thiểu: `temperature` mặc định không cao, rubric chi tiết có mô tả từng tiêu chí, lưu điểm **từng tiêu chí kèm lý do**, chấp nhận sai số ±0.3.
- **Bài kiểm tra rời rạc không dạy được.** 8 câu hỏi độc lập đều ở độ khó giống nhau là 8 bài tập, không phải phỏng vấn. Người dùng cần cảm giác **được phỏng vấn**: AI đi sâu vào câu trả lời hời hợt, chuyển câu khi đã đủ.
- **Không có bộ đệm so sánh thì đo một lần chưa thành dữ liệu.** Một điểm 4.1/5.0 chỉ có nghĩa khi biết lần trước là 3.5/5.0 (FR-MI-09, AC-13).
- **Q6 chưa chốt.** SPEC §10 Q6 hỏi: mock interview theo hướng nào — ứng tuyển vị trí cụ thể hay luyện chung "kỹ năng chuyên môn"? Mặc định theo SPEC: **hồ sơ mặc định lấy từ cây kỹ năng + `jobTitle` người dùng nhập ở S16; câu hỏi thiên về `concept`/`design`**. Feature này chốt theo mặc định đó, và cho phép người dùng tạo nhiều hồ sơ (Backend Engineer, Product Manager…) để mở rộng theo hướng ứng tuyển.

---

## 3. Yêu cầu chức năng

### 3.1 Hồ sơ vai trò & cấu hình phiên (FR-MI-01, FR-MI-12)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-MI-01 | Hồ sơ vai trò gồm `jobTitle`, `seniority` (junior/mid/senior/lead), `focusSkills[]` (chọn từ cây kỹ năng), `language` phỏng vấn (`en`/`vi`/`zh`), `questionKinds[]`, `sessionType`. Lưu **nhiều** hồ sơ ("Backend Engineer", "Product Manager"). Mỗi hồ sơ có nhãn riêng. | P0 | FR-MI-01 |
| FR-MI-02 | Sinh câu hỏi từ `Skill` tree: ưu tiên mục có **ít bằng chứng nhất**; cân bằng giữa các dạng câu đã chọn. | P0 | FR-MI-02 |
| FR-MI-03 | 5 dạng câu: `concept` · `design` · `debug` · `tradeoff` · `behavioral`. | P0 | FR-MI-03 |
| FR-MI-12 | Chọn số câu: **5** (khai thác nhanh) · **8** (chuẩn) · **12** (kỹ). Mặc định 8. | P0 | FR-MI-12 |
| FR-MI-13 | Cho phép **dừng giữa chừng**; phiên bị bỏ dở giữ nguyên, **resume được**. | P1 | FR-MI-13 |
| FR-MI-14 | Trả lời bằng **tiếng Anh** → phiên đó vừa đo chuyên môn vừa đo tiếng Anh; ghi **riêng** điểm "clarity of expression" (P2). | P2 | FR-MI-14 |

**Mở rộng từ prototype (không đổi số hiệu FR):**

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-MI-01a | Chọn **phương thức trả lời**: văn bản (luôn có) hoặc giọng nói (STT). Nút "Tùy chỉnh chọn node thủ công" cho phép ghim đè node yếu do AI tự chọn. | P0 | FR-MI-01 + prototype S16 |
| FR-MI-11 | Nút **"Câu hỏi này có vấn đề"** (flag) → ghi log cải thiện chất lượng sinh câu hỏi. | P1 | FR-MI-11 |

### 3.2 Chấm điểm & thích ứng (FR-MI-04…FR-MI-06)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-MI-04 | **Rubric kỹ thuật** 5 tiêu chí, thang 0–5: ① Chính xác ② Chiều sâu ③ Lập luận ④ Giao tiếp ⑤ Nhận biết đánh đổi. | P0 | FR-MI-04 |
| FR-MI-05 | **Rubric hành vi** 4 tiêu chí, thang 0–5: ① Cụ thể ② Đầy đủ STAR ③ Tự nhận thức ④ Kết quả. Chỉ áp dụng cho câu `behavioral`. | P0 | FR-MI-05 |
| FR-MI-06 | **Adaptive**: mỗi lượt AI làm **2 việc trong 1 call** — chấm câu vừa trả lời + sinh câu tiếp theo (follow-up nếu trả lời hời hợt, chuyển câu mới nếu đã đủ). | P0 | FR-MI-06 |
| FR-MI-07 | Trả lời bằng **văn bản** (luôn) hoặc **giọng nói** (STT qua Web Speech API). Ngôn ngữ trả lời theo hồ sơ. | P0 (văn bản) / P1 (giọng nói) | FR-MI-07 |

### 3.3 Báo cáo & tích hợp dữ liệu (FR-MI-08…FR-MI-10)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-MI-08 | Báo cáo cuối phiên: điểm từng tiêu chí, điểm tổng, **3 điểm mạnh cụ thể (trích dẫn câu trả lời)** + **3 điểm yếu cụ thể (kèm số câu)**, và **đề xuất luyện tiếp** trỏ tới `Skill` cụ thể trong cây. | P0 | FR-MI-08 |
| FR-MI-09 | So sánh với phiên trước **cùng hồ sơ vai trò**: delta từng tiêu chí + biểu đồ tiến bộ theo thời gian. | P1 | FR-MI-09 |
| FR-MI-10 | Lưu: **1 `Activity`** (domain `professional`, type `mock_interview`, `aiScore` = điểm tổng) + **1 `Evidence`** cho `Skill` trọng tâm nhất của phiên. | P0 | FR-MI-10 |

### 3.3b AI Interview Studio — 3 loại phiên & gợi ý cụ thể (Q6)

> Nguồn chân lý: `.kiro/steering/user-profile-decisions.md` §6.

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-MI-15 | Hỗ trợ **3 loại phiên** qua `InterviewSession.sessionType`: `skill_drill` (hỏi sâu 1 mục kỹ năng) · `interview_loop` (vòng tròn tuyến tính giới thiệu→chuyên môn→hệ thống→hỏi ngược) · `partner_sim` (AI đóng vai đối tác/sếp/khách hàng, **không phải** interviewer). | P1 | Q6 · C30 |
| FR-MI-16 | `S16` hiển thị **≥3 gợi ý phiên cụ thể** do AI sinh, mỗi gợi ý gồm `title` · `whyNow` (**dẫn chứng Evidence cụ thể**) · `focusSkillIds[]` · `questionKinds[]` · `plannedCount` · `estMinutes`. Không được sinh gợi ý generic ("Luyện Java chung"). | P1 | Q6 · M10 |
| FR-MI-17 | Quản lý **nhiều phiên**: lịch sử phiên (ngày · hồ sơ · loại · điểm tổng · trạng thái), so sánh phiên (FR-MI-09), resume phiên dang dở (FR-MI-13), và gợi ý "nên làm phiên nào tiếp" theo mục kỹ năng yếu nhất. | P1 | Q6 · FR-MI-09 · FR-MI-13 |

**Ràng buộc chống gợi ý generic (rủi ro R8):** mỗi gợi ý phải trả lời được
*"vì sao phiên này, lúc này"* bằng **số liệu Evidence thật** — ví dụ
"2/14 Evidence ở 'Lựa chọn giải pháp & đánh đổi'". Gợi ý không có số liệu → không hiển thị.

### 3.4 Bảng 5 dạng câu hỏi (FR-MI-03)

| Mã | Tên hiển thị | Mô tả | Kỳ vọng độ sâu | Ví dụ câu hỏi mẫu (role Backend Engineer, senior, vi) |
|---|---|---|---|---|
| `concept` | Kiến thức nền (Concept) | Kiểm tra hiểu biết nguyên lý, khái niệm, cơ chế nền. Không cần bối cảnh hệ thống cụ thể. | **Nông → trung bình.** Người trả lời cần nêu định nghĩa, cơ chế hoạt động và một ví dụ/minh hoạ. Điểm "Chiều sâu" chỉ đạt khi giải thích **tại sao** cơ chế đó tồn tại. | *"Giải thích cơ chế giải quyết race condition khi đặt chỗ trong hệ thống đặt vé sân bay. Vì sao cần một lớp điều phối thay vì chỉ dùng transaction của database?"* |
| `design` | Thiết kế hệ thống (System Design) | Yêu cầu thiết kế giải pháp cho một bài toán có ràng buộc quy mô. Đo khả năng **định lượng** và **phân tầng**. | **Sâu.** Cần: yêu cầu → ràng buộc → kiến trúc → thành phần → giao diện giữa các thành phần → đánh đổi → vận hành (SLO, failover). Thiếu phần định lượng thì trừ điểm "Lập luận". | *"Thiết kế hệ thống đặt vé sân bay cho 10 triệu người dùng/ngày, đỉnh 150.000 booking/giây. Hãy mô tả kiến trúc, cách xử lý race condition khi giữ chỗ và chiến lược đảm bảo nhất quán."* |
| `debug` | Điều tra sự cố (Debugging & RCA) | Đưa ra tình huống hỏng (sự cố) và yêu cầu người trả lời điều tra **từ triệu chứng tới nguyên nhân gốc**. | **Sâu + có trình tự.** Cần quy trình khoanh vùng → thu thập bằng chứng → giả thuyết → kiểm chứng → khắc phục → phòng ngừa. Điểm "Lập luận" đo khả năng **loại trừ** giả thuyết sai. | *"Dịch vụ đặt vé phản hồi chậm và tăng lỗi 502 từ 2 giờ trước sau khi deploy bản mới. Bạn sẽ điều tra theo trình tự nào, dùng công cụ gì, và làm sao biết chắc nguyên nhân gốc?"* |
| `tradeoff` | Đánh đổi quyết định (Trade-off Analysis) | Đặt hai phương án cạnh tranh lên bàn, yêu cầu **chọn và biện minh**, nói rõ cái giá phải trả. | **Sâu về lý luận đánh đổi.** Không điểm "Nhận biết đánh đổi" nếu chỉ nêu ưu điểm. Phải nêu: đánh đổi được, đánh đổi mất, và **khi nào không nên dùng** lựa chọn đó. | *"Với hệ thống đặt vé, bạn chọn giữa hàng đợi Kafka (độ trễ vài giây, vận hành phức tạp) và giao dịch trực tiếp với PostgreSQL (nhất quán mạnh, cần khóa phân tán). Hãy chọn và nêu rõ cái giá của lựa chọn đó."* |
| `behavioral` | Hành vi theo STAR (Behavioral) | Hỏi về tình huống thật đã trải qua, kèm yêu cầu **bám theo cấu trúc STAR** (tình huống → nhiệm vụ → hành động → kết quả). | **Trung bình về kỹ thuật, sâu về câu chuyện.** Chấm bằng rubric hành vi 4 tiêu chí. Câu trả lời không có ví dụ cụ thể hoặc không nêu kết quả đo được → điểm thấp. | *"Hãy kể một lần bạn phải xử lý một quyết định kỹ thuật gây ra hậu quả ngoài dự kiến. Bạn đã làm gì và kết quả đo được là gì?"* |

**Quy tắc phân bổ (FR-MI-02):**

| Quy tắc | Hành vi |
|---|---|
| Cân bằng dạng câu | Trong `plannedCount` câu, mỗi dạng đã chọn nhận **ít nhất 1 câu**; phần dư phân bổ vòng tròn theo thứ tự ưu tiên `concept → design → debug → tradeoff → behavioral` (theo thứ tự người dùng bật). |
| Ưu tiên node yếu | Câu hỏi được gán cho node kỹ năng theo thứ tự yếu tăng dần (thuật toán §5.7) — node yếu nhất nhận câu đầu tiên. |
| Follow-up không tính phân bổ | Câu follow-up (`isFollowUp=true`) **không** thay thế slot của một dạng câu — nó đào sâu câu trước, giữ nguyên `kind` và `skillId`. |
| Tổng số câu | `askedCount` không vượt quá `plannedCount`; câu cuối cùng luôn là câu **tổng kết** (wrap-up) theo vai trò. |

### 3.5 Bảng rubric chuẩn (FR-MI-04, FR-MI-05)

**Rubric kỹ thuật — `RUBRIC_TECHNICAL` (5 tiêu chí, thang 0–5):**

Áp dụng cho câu `concept` · `design` · `debug` · `tradeoff`.

| key | Tên | Mô tả (`desc`) — đưa nguyên văn vào prompt | 0 | 3 | 5 |
|---|---|---|---|---|---|
| `accuracy` | Chính xác | Nội dung kỹ thuật đúng, không sai lệch kiến thức nền | Sai lệch nguyên lý cốt lõi | Đúng ở mức chính, thiếu chi tiết quan trọng | Chính xác hoàn toàn, định danh đúng thuật ngữ và giới hạn |
| `depth` | Chiều sâu | Đi sâu vào bản chất vấn đề, không dừng ở mặt ngoài | Chỉ lặp lại định nghĩa bề mặt | Giải thích cơ chế nhưng chưa chạm bản chất | Đi tới nguyên lý sâu, chỉ ra điều kiện biên và ngoại lệ |
| `reasoning` | Lập luận | Có chuỗi suy luận rõ ràng từ giả định đến kết luận | Không có chuỗi lập luận | Có bước nhưng thiếu liên kết giả định–kết luận | Chuỗi suy luận chặt, loại trừ được giả thuyết sai |
| `communication` | Giao tiếp | Diễn đạt rõ ràng, có cấu trúc, người nghe theo kịp | Rối, không theo kịp | Rõ nhưng thiếu cấu trúc | Có cấu trúc rõ, điều quan trọng đứng đầu, ví dụ minh hoạ |
| `tradeoff` | Nhận biết đánh đổi | Nói được cái giá của lựa chọn và khi nào không dùng | Không nêu đánh đổi | Nêu đánh đổi nhưng không nói khi nào không dùng | Nêu rõ cái giá, điều kiện không dùng và phương án thay thế |

**Rubric hành vi — `RUBRIC_BEHAVIORAL` (4 tiêu chí, thang 0–5):**

Áp dụng cho câu `behavioral` (chấm vào `behavioralScores`, **không** trộn với `scores`).

| key | Tên | Mô tả (`desc`) — đưa nguyên văn vào prompt | 0 | 3 | 5 |
|---|---|---|---|---|---|
| `specific` | Cụ thể | Có ví dụ cụ thể từ trải nghiệm thật, không nói chung chung | Toàn mơ hồ, không có gì thật | Có ví dụ nhưng chung chung, thiếu chi tiết định lượng | Ví dụ thật, có con số, có bối cảnh cụ thể |
| `star` | Đầy đủ STAR | Rõ tình huống → nhiệm vụ → hành động → kết quả | Thiếu cả bốn thành phần | Có 2–3 thành phần rõ | Đủ bốn thành phần, chuyển tiếp mượt, không lặp |
| `selfaware` | Tự nhận thức | Nhận ra điều mình làm chưa tốt và vì sao | Không nhận ra sai sót | Nhận nhưng không rõ nguyên nhân | Nhận ra sai sót cụ thể và giải thích được vì sao mình sai |
| `outcome` | Kết quả | Kết quả có thể đo được, không chỉ là cảm nhận | Chỉ nói "tốt hơn" | Có kết quả nhưng không định lượng | Kết quả định lượng (số liệu, mốc thời gian, phạm vi) |

**Quy tắc tính điểm (bất di bất dịch — P4):**

| # | Quy tắc |
|---|---|
| 1 | Mỗi câu được chấm **đúng** 5 tiêu chí kỹ thuật, **hoặc** đúng 4 tiêu chí hành vi (tuỳ `kind`). Không thêm, không bỏ, không gộp. |
| 2 | Mỗi tiêu chí trả `{ score: 0..5, note: 1–2 câu giải thích dựa trên câu trả lời }`. `note` phải chỉ ra chi tiết cụ thể trong câu trả lời, không được chung chung. |
| 3 | `total` của câu = **trung bình** các tiêu chí đã chấm (làm tròn 2 chữ số). `total` của phiên = trung bình `total` của các câu đã trả lời. |
| 4 | AI **không** được thêm tiêu chí nào ngoài danh sách trên. Trả thêm → hệ thống loại bỏ key đó. |
| 5 | Điểm ngoài `[0,5]` → clamp về biên, ghi log lỗi schema. |
| 6 | Câu trả lời rỗng hoặc không liên quan → điểm 0 cho mọi tiêu chí, `note` nói rõ vì sao. |

---

## 4. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí kiểm tra |
|---|---|---|
| NFR-MI-01 | **Mobile-first** | S16/S17/S18 dùng được ở 390px. Nút hành động chính (Gửi câu trả lời, Bắt đầu phiên) nằm trong vùng ngón cái, cố định đáy màn hình ở S17. |
| NFR-MI-02 | **Một call = một lượt** | Mỗi lượt trả lời chỉ tốn **1** request AI-12 (không tách thành 2 call chấm + sinh). Đo bằng `AiCall.feature='mock_interview'` theo lượt. |
| NFR-MI-03 | **Prompt caching giữ được** | `usage.cache_read_input_tokens` của lượt thứ 2 > 0 (AC-5). Lịch sử hội thoại **chỉ append**, không sửa lượt cũ. |
| NFR-MI-04 | **Offline mode** | Thiếu `ANTHROPIC_API_KEY` → S16 hiển thị hồ sơ + cấu hình + kỹ năng yếu (toàn bộ tính bằng query SQL, không cần AI); nút "Bắt đầu" bị ẩn, thay bằng hướng dẫn thêm key. **Không** giả lập phản hồi AI. |
| NFR-MI-05 | **Không làm sập trang** | Lỗi AI (429 / refusal / timeout) → `AiCall{ok:false}` + thông báo ngắn có nút "Thử lại". Câu trả lời của người dùng **không** bị mất. |
| NFR-MI-06 | **A11y** | Tương phản ≥ WCAG AA. Mọi icon-only button có `aria-label`. Vùng điểm câu trước và phản hồi AI dùng `aria-live="polite"`. Điều hướng bàn phím đầy đủ trong S17 (textarea → nút gửi → nút tạm dừng). |
| NFR-MI-07 | **Không phụ thuộc ngoài** | TTS đọc câu hỏi và STT nhận giọng nói dùng Web Speech API của trình duyệt (NFR-07). Không thêm SDK. |
| NFR-MI-08 | **Điểm có lý do** | Mọi điểm tiêu chí đều lưu kèm `note` (1–2 câu giải thích). Không có điểm trần nào trong DB (tech.md §5). |
| NFR-MI-09 | **Xuất dữ liệu** | S18 xuất JSON tự chứa (`NFR-08`) gồm hồ sơ, lượt, điểm, báo cáo — không cần DB để dựng lại. |
| NFR-MI-10 | **Chi phí quan sát được** | Mỗi call AI-11/12/13 ghi `AiCall{feature:'mock_interview'}`. S16 hiển thị ước tính chi phí theo số câu đã chọn; S15 hiển thị tổng chi phí thực tế. |
| NFR-MI-11 | **Không vanity metric (P7)** | S18 không hiển thị phân vị ứng viên, độ tin cậy dữ liệu, hay "tổng giờ phỏng vấn" rời rạc. Mọi số phải gắn được với `Skill` hoặc tiêu chí rubric. |

---

## 5. Mô hình dữ liệu

> **Registry:** `.kiro/steering/data-model-registry.md` — `InterviewSession.activityId` = **`C28`**
> (FK 1–1 tới `Activity`, `onDelete: SetNull`; không có nó thì idempotency tạo Activity/Evidence không chắc chắn).
> **Q6:** `InterviewSession.sessionType` = **`C30`** · `InterviewSession.focusHint` = **`C31`** ·
> model mới `InterviewSuggestion` = **`M10`** (gợi ý phiên cụ thể; nhánh dự phòng: tính từ `Evidence` cục bộ).

Ba model đã có sẵn trong SPEC §4 — feature này **không thêm model mới**, chỉ dùng và bổ sung **2 cột** (`answerMode`, `englishClarity`) để phục vụ FR-MI-07 và FR-MI-14.

### 5.1 `InterviewProfile`

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id` | String (cuid) | PK |
| `label` | String | "Backend Engineer" — tên hiển thị trên card S16 |
| `jobTitle` | String | Bắt buộc — truyền vào prompt (R8) |
| `seniority` | String | `junior` \| `mid` \| `senior` \| `lead`, default `mid` |
| `language` | String | `en` \| `vi`, default `en` — ngôn ngữ phỏng vấn |
| `questionKinds` | String (JSON) | `["concept","design","debug","tradeoff","behavioral"]` — tập con của 5 dạng |
| `focusSkills` | String (JSON) | `[skillId]` — chỉ node trong domain `professional` |
| `answerMode` | String | `text` \| `voice`, default `text` — **cột bổ sung (FR-MI-07)** |
| `englishClarity` | Boolean | default `false` — **cột bổ sung (FR-MI-14)** |
| `createdAt` | DateTime | |
| `sessions` | `InterviewSession[]` | |

### 5.2 `InterviewSession`

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id` | String (cuid) | PK — là `:id` của route S18 |
| `profileId` | String | FK → `InterviewProfile`, `onDelete: Cascade` |
| `plannedCount` | Int | 5 \| 8 \| 12 (FR-MI-12) |
| `askedCount` | Int | Số câu đã **hỏi** (tăng ngay khi sinh câu, không phải khi trả lời) |
| `status` | String | `active` \| `paused` \| `done` \| `abandoned` — **bổ sung `paused`** cho FR-MI-13 |
| `totalScore` | Float? | Điểm tổng = trung bình điểm các câu đã trả lời |
| `skillsFocused` | String (JSON) | `[skillId]` — node được ghim cho phiên này (AI chọn hoặc user chọn tay) |
| `startedAt` | DateTime | |
| `endedAt` | DateTime? | |
| `report` | Json? | **cột bổ sung** — kết quả AI-13 (3 mạnh / 3 yếu / đề xuất), xem §5.5 |
| `turns` | `InterviewTurn[]` | |
| `activity` | `Activity?` | |

### 5.3 `InterviewTurn`

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id` | String (cuid) | PK |
| `sessionId` | String | FK → `InterviewSession`, `onDelete: Cascade` |
| `index` | Int | 1-based, duy nhất trong phiên |
| `question` | String | Nội dung câu hỏi |
| `kind` | String | `concept` \| `design` \| `debug` \| `tradeoff` \| `behavioral` |
| `skillId` | String? | **bổ sung** — node kỹ năng mà câu hỏi nhắm tới (dùng cho FR-MI-10) |
| `skillName` | String? | Denormalized để hiển thị chip kỹ năng ở S17 |
| `answer` | String? | Null = câu chưa được trả lời (chỉ mới hỏi) |
| `scores` | Json? | `{accuracy:[score,note], depth:[...], reasoning:[...], communication:[...], tradeoff:[...]}` — 5 tiêu chí kỹ thuật |
| `behavioralScores` | Json? | **cột bổ sung (FR-MI-05)** — `{specific:[...], star:[...], selfaware:[...], outcome:[...]}` cho câu `behavioral` |
| `clarityScore` | Float? | **cột bổ sung (FR-MI-14)** — điểm "clarity of expression" khi trả lời bằng tiếng Anh, thang 0–5 |
| `total` | Float? | Trung bình các tiêu chí của câu đó |
| `feedback` | String? | 1–2 câu nhận xét, hiển thị trong phiên dạng thu gọn |
| `nextQuestion` | String? | Câu hỏi kế tiếp do AI-12 sinh cùng lúc với việc chấm |
| `nextKind` | String? | **bổ sung** — dạng của câu kế tiếp |
| `nextSkillId` | String? | **bổ sung** — node của câu kế tiếp |
| `isFollowUp` | Boolean | **bổ sung** — true nếu câu này là follow-up của câu trước (AC-9) |
| `adaptiveReason` | String? | **bổ sung** — lý do AI chọn câu này (hiển thị "Ghi chú thích ứng") |
| `flagged` | Boolean | **bổ sung (FR-MI-11)** — người dùng đánh dấu câu hỏi có vấn đề |
| `flagReason` | String? | **bổ sung (FR-MI-11)** — lý do ngắn (≤500 ký tự) kèm theo cờ |
| `createdAt` | DateTime | |

### 5.4 Cấu trúc `scores` (JSON)

```jsonc
{
  "accuracy":      { "score": 4.2, "note": "Đúng về khóa phân tán, nhưng quên điều kiện phân mảnh quá tranh." },
  "depth":         { "score": 3.5, "note": "Mới dừng ở tầng Redis, chưa đi tới hiệu ứng split-brain." },
  "reasoning":     { "score": 4.0, "note": "Suy luận từ bottleneck → giải pháp rõ ràng." },
  "communication": { "score": 4.4, "note": "Cấu trúc bullet, dẫn ý tốt." },
  "tradeoff":      { "score": 3.8, "note": "Nêu được đánh đổi độ trễ nhưng chưa nêu chi phí vận hành." }
}
```

`score` là số thực 0–5 (làm tròn 1 chữ số khi hiển thị). `note` bắt buộc (NFR-MI-08). **Không có key nào ngoài 5 (hoặc 4 cho behavioral)** — đây là điều kiện kiểm của AC-9.

### 5.5 Cấu trúc `report` (JSON, phiên)

```jsonc
{
  "overallNote": "Phân tích về hệ thống đặt vé sân bay là dạng bài bạn đã có cấu trúc tốt, nhưng còn thiếu ước lượng back-of-the-envelope.",
  "strengths": [
    { "title": "Tách đọc–ghi theo CQRS", "quote": "Tôi tách theo hướng ghi và hướng đọc...", "turnIndex": 2, "comment": "Phân tích đúng bài toán read-heavy." },
    { "title": "Nêu được chi phí eventual consistency", "quote": "Kafka giải quyết throughput...", "turnIndex": 5, "comment": "Thể hiện góc nhìn Senior." },
    { "title": "Cấu trúc STAR rõ ở sự cố memory leak", "quote": "Tôi dùng pprof capture heap snapshot...", "turnIndex": 7, "comment": "Đi đúng quy trình khoanh vùng." }
  ],
  "weaknesses": [
    { "title": "Chưa làm rõ SLA khi Redis failover", "turnIndex": 4, "comment": "Thiếu đánh đổi về 3–5s mất ghi.", "suggestion": "Thêm Sentinel tuning + circuit breaker." },
    { "title": "Định lượng dung lượng mới mang tính lý thuyết", "turnIndex": 5, "comment": "Thiếu ví dụ GB/ngày, IOPS.", "suggestion": "Luyện back-of-the-envelope calculation." },
    { "title": "Bỏ qua tuân thủ dữ liệu nhạy cảm", "turnIndex": 7, "comment": "Không nói về mã hóa at-rest, RPO/RTO.", "suggestion": "Chuẩn bị template RPO < 5m." }
  ],
  "nextPractices": [
    { "skillId": "abc", "skillName": "Lựa chọn giải pháp", "evidenceCount": 0, "action": "Tạo 3 bài tập về đánh đổi kiến trúc" },
    { "skillId": "def", "skillName": "Phân tích yêu cầu", "evidenceCount": 2, "action": "Thực hành viết PRD hệ thống cache" }
  ],
  "totalScore": 4.1,
  "rubric": { "accuracy": 4.5, "depth": 3.8, "reasoning": 4.3, "communication": 4.4, "tradeoff": 3.6 }
}
```

**Ràng buộc:** `strengths` và `weaknesses` **luôn dài đúng 3** (AC-9). `nextPractices` 1–3 phần tử, `skillId` phải tồn tại trong `Skill` và thuộc `skillsFocused` của phiên.

### 5.6 Quan hệ & ràng buộc

```
UserProfile ──┐
              │
Skill ◄── Evidence ◄── Activity ◄── InterviewSession ──► InterviewProfile
  │  ▲                                                        │  ▲
  │  └── skillsFocused (JSON) ────────────────────────────────┘  │
  └──────────── InterviewTurn.skillId ────────────────────────────┘
```

| # | Ràng buộc |
|---|---|
| 1 | `InterviewProfile.focusSkills` chỉ chứa `skillId` thuộc domain `professional` và còn tồn tại trong `Skill`. Node bị xoá giữa lúc → bỏ khỏi danh sách, không crash (FK cascade). |
| 2 | `InterviewSession.profileId` FK `onDelete: Cascade` — **xoá hồ sơ = xoá luôn các phiên của hồ sơ đó**. Vì vậy hồ sơ bị xoá nhưng còn phiên cũ là trạng thái **không thể xảy ra**; xem Edge case §6.5. |
| 3 | `Activity.type = 'mock_interview'`, `Activity.domain = 'professional'`, `Activity.aiScore = InterviewSession.totalScore`, `Activity.skillId` = skill trọng tâm. |
| 4 | `Evidence.activityId = Activity.id`, `Evidence.skillId` = skill trọng tâm, `Evidence.rating` = `clamp(round(totalScore), 1, 4)` (thang Evidence là 1–4). |
| 5 | Mỗi `InterviewSession` tạo **đúng 1** Activity + **đúng 1** Evidence, chỉ khi `status='done'`. |
| 6 | `InterviewTurn.index` duy nhất trong phạm vi `sessionId`. |

### 5.7 Truy vấn chọn kỹ năng yếu (FR-MI-02, AC-10)

```sql
-- Đếm bằng chứng theo skill, chỉ trong focusSkills
SELECT s.id, s.name, s.level,
       (SELECT COUNT(*) FROM Evidence e WHERE e.skillId = s.id) AS evidenceCount,
       (SELECT AVG(e.rating) FROM Evidence e WHERE e.skillId = s.id) AS avgRating
FROM Skill s
WHERE s.id IN (:focusSkillIds)
  AND s.domain = 'professional'
ORDER BY evidenceCount ASC, avgRating ASC, s.level ASC, s.name ASC
LIMIT :pinCount;   -- pinCount = 2 (mặc định) hoặc số node user ghim tay
```

Sắp xếp 4 khoá, theo thứ tự ưu tiên:
1. `evidenceCount` **tăng dần** — ưu tiên mục ít bằng chứng nhất (đúng AC-10: "Lựa chọn giải pháp" 0 bằng chứng đứng trước "Phân tích yêu cầu" 2 bằng chứng).
2. `avgRating` tăng dần — bằng chứng có nhưng yếu vẫn thấp hơn bằng chứng mạnh.
3. `s.level` tăng dần — node level thấp ưu tiên.
4. `s.name` tăng dần — **khoá ổn định** để cùng dữ liệu luôn cho cùng kết quả (quan trọng cho R9: điểm phải lặp lại được).

---

## 6. Giao diện & hành vi

### 6.1 Bố cục — S16 Cấu hình (`/interview/setup`)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ FR-MI-01 / MOCK INTERVIEW SYSTEM / [CẤU HÌNH THÍCH ỨNG ADAPTIVE]          │
│ Thiết Lập Phiên Phỏng Vấn Kỹ Năng Chuyên Môn        ● Local: đồng bộ 100% │
│ AI đặt câu hỏi từ Cây kỹ năng của chính bạn, ưu tiên node thiếu bằng    │
│ chứng, chấm theo rubric định lượng cố định.                               │
├──────────────────────────────────────┬─────────────────────────────────────┤
│ ▣ HỒ SƠ VAI TRÒ PHỎNG VẤN            │ ▣ RUBRIC CHẤM CHUẨN HÓA  [FR-MI-04] │
│ [+ Tạo hồ sơ vai trò mới]           │ Mỗi câu trả lời → 5 chiều vector    │
│ ┌──────────────┬──────────────┐     │ ● Chính xác     Đúng ngữ nghĩa KT  │
│ │●Backend Eng. │ System Arch. │     │ ● Chiều sâu     Under the hood      │
│ │ EN Senior IC5│ Staff/Lead   │     │ ● Lập luận      Logic rành mạch      │
│ │ 5 dạng·4 skill│ 4 dạng·3 skill│    │ ● Giao tiếp      Ngắn gọn, rõ cấu trúc│
│ │ 8 phiên · 4.1 │ 2 phiên·3.8  │     │ ● Đánh đổi      Biết cái giá phải trả│
│ ├──────────────┴──────────────┤     │ ┌─────────────────────────────────┐ │
│ │ Engineering Manager          │     │ │ Ngưỡng đạt Senior  ≥ 4.0 / 5.0  │ │
│ │ VI M1 · STAR & Trade-off     │     │ └─────────────────────────────────┘ │
│ │ Chưa kích hoạt               │     │                                     │
│ └──────────────────────────────┘     │ ▣ ƯỚC TÍNH TÀI NGUYÊN AI           │
├──────────────────────────────────────┤ Độ dài phiên      8 câu hỏi          │
│ ▣ KỸ NĂNG TRỌNG TÂM TỪ CÂY KỸ NĂNG  │ Prompt Caching    Tối ưu 90%        │
│ [Tùy chỉnh chọn node thủ công]      │ Latency TB        ~1.2s / phản hồi  │
│ ┌──────────────────────────────────┐ │ Chi phí ước tính  ~$0.18 USD        │
│ │ ⚡ Hệ thống đã ghim 2 node yếu    │ │ Dữ liệu lưu cục bộ vào SQLite      │
│ │ nhất để tạo thử thách trong phiên│ │                                     │
│ └──────────────────────────────────┘ │ ▣ ĐÃ SẴN SÀNG                       │
│ ┌────────────────────┬────────────┐ │ Khởi Chạy Buồng Phỏng Vấn          │
│ │[P0] Lựa chọn giải  │[P1] Phân tích│ │ [▶ Bắt đầu Phiên Phỏng Vấn →]    │
│ │ pháp & Trade-offs  │ yêu cầu & NFR│ │ ~25 Phút • Tự động lưu • Esc hủy   │
│ │ ⚠ 0 bằng chứng    │ ⏱ 2 (L1/5) │ │                                     │
│ │ Score: 0.0        │ Score: 1.2  │ │                                     │
│ └────────────────────┴────────────┘ │                                     │
├──────────────────────────────────────┤                                     │
│ ▣ CHI TIẾT CẤU HÌNH PHIÊN            │                                     │
│ 1. DẠNG CÂU HỎI MONG MUỐN            │                                     │
│ [✓ Kiến thức nền][✓ Thiết kế HT][✓ Điều tra SC][✓ Đánh đổi][○ Hành vi]│
│ 2. ĐỘ DÀI PHIÊN  (5) (8 ✓) (12)     │                                     │
│ 3. PHƯƠNG THỨC TRẢ LỜI  (Văn bản ✓)(Giọng nói)│
│ 4. TÙY CHỌN THÔNG MINH  [✓ Adaptive][✓ Đo tiếng Anh song song]          │
└──────────────────────────────────────┴─────────────────────────────────────┘
```

**Cột trái (8/12 cột)** — 3 section tuần tự: Hồ sơ vai trò → Kỹ năng trọng tâm → Chi tiết cấu hình phiên.
**Cột phải (4/12 cột)** — 3 card: Rubric → Ước tính tài nguyên AI → CTA khởi chạy.

### 6.2 Bố cục — S17 Phiên (`/interview/session`)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [FR-MI-01 · LIVE SESSION] [Senior Backend Engineer] 🌐 Phỏng vấn Tiếng Anh │
│ Phiên Phỏng Vấn Thích Ứng · Câu 3/8              ID: MI-2026-1029-SE3     │
│                                            ┌──────────────┐ ┌────────────┐ │
│                                            │⏱ 04:12 câu này│ │Tổng 18:30│ │
│                                            └──────────────┘ └────────────┘ │
│                              [⏸ Tạm dừng & Lưu]  [⚑ Flag]                 │
│ Tiến độ thích ứng năng lực                    37.5% Hoàn thành (3/8 câu) │
│ ┌────┬────┬────┬────┬────┬────┬────┬────┐                                │
│ │Q1 ✓│Q2 ✓│Q3 ●│Q4 ⋯│Q5 ⋯│Q6 ⋯│Q7 ⋯│Q8 🔒│                                │
│ │4.2 │3.9 │Gen │chờ │chờ │chờ │chờ │Tổng│                                │
│ └────┴────┴────┴────┴────┴────┴────┴────┘                                │
├──────────────────────────────────────────┬─────────────────────────────────┤
│ ▣ [avatar] Claude Opus 5  [ADAPTIVE LEAD  │ ▣ ĐÁNH GIÁ CÂU 2    [Tổng 3.9] │
│           EVALUATOR]      [🔊 Nghe câu hỏi]│ Tiêu chí chấm điểm đa chiều    │
│ ┌──────────────────────────────────────┐ │ Độ chính xác kỹ thuật  4.2/5 ▓▓ │
│ │ "You are designing an Airport Flight│ │ Chiều sâu giải pháp     3.5/5 ▓▓ │
│ │  Booking System. With 10 million    │ │ Khả năng lập luận      4.0/5 ▓▓ │
│ │  daily active users and peak         │ │ Phân tích đánh đổi     3.8/5 ▓▓ │
│ │  flash-sale loads of 150,000         │ │ ┌───────────────────────────────┐ │
│ │  bookings/second, describe how you   │ │ │🧠 Ghi chú thích ứng           │ │
│ │  mitigate race conditions on seat    │ │ │ Câu 3 sinh thêm để kiểm tra    │ │
│ │  reservations..."                    │ │ │ chiều sâu giải pháp đánh đổi │ │
│ └──────────────────────────────────────┘ │ │ khóa phân tán ở câu 2.         │ │
│ Kỹ năng mục tiêu: [System Design →      │ └───────────────────────────────┘ │
│   Concurrency & Locks] ⚠ ưu tiên node    │ ▣ TRẠNG THÁI PHÁT ÂM             │
│   yếu nhất                              │ [waveform visualization]            │
├──────────────────────────────────────────┤ Web Speech API · độ trễ 42ms      │
│ ▣ YOU — Câu trả lời của bạn             │ Độ khắt khe ngữ pháp: C1           │
│ Hỗ trợ Markdown, Code snippet & Giọng nói│ Mô hình đánh giá: Opus 5            │
│ [code][bullets][fx]│ [🎤 Ghi âm STT]    │ Quy tắc chấm: FR-MI-04            │
│ ┌──────────────────────────────────────┐ │                                     │
│ │ I would implement a two-phase       │ │                                     │
│ │ reservation approach. At the edge... │ │                                     │
│ └──────────────────────────────────────┘ │                                     │
│ Số từ: 52 · Thời gian gõ: 02:18 · ☁ autosave  │  │
│ [Xem lại gợi ý cấu trúc (STAR)] [Xóa làm lại] │                                 │
│                    [Gửi câu trả lời & AI chấm tiếp →]                      │
└──────────────────────────────────────────┴─────────────────────────────────┘
```

**Cột trái (8/12 cột)** — card interviewer (avatar + TTS + câu hỏi + chip kỹ năng) → card trả lời (toolbar + textarea + footer + hành động).
**Cột phải (4/12 cột)** — panel điểm câu trước (thu gọn) + panel trạng thái phát âm.

### 6.3 Bố cục — S18 Kết quả (`/interview/[id]`)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Báo cáo đánh giá năng lực thực chiến · Claude Opus 5 (Evaluator v2.4)     │
│ Kết quả phỏng vấn chuyên môn · Vị trí: Backend Engineer (Senior)          │
│ 📅 29/10/2026 · 🎯 8 câu hỏi chuyên sâu · ⏱ 23 phút hoàn thành            │
│                            [⬇ Xuất báo cáo PDF/JSON] [↻ Làm lại hồ sơ này]  │
├──────────────────────────────────────────┬─────────────────────────────────┤
│ CHỈ SỐ NĂNG LỰC TỔNG HỢP  [Senior L5]  │ KHUNG KỸ THUẬT CHUẨN HÓA         │
│                                          │ 5 Tiêu chí Rubric Chuyên môn    │
│            4.1  / 5.0                    │ (FR-MI-04)                      │
│ [▲ +0.6 so với phiên trước cùng vị trí] │ 🟩 Đạt chuẩn 🟨 Cần rèn luyện     │
│ ┌──────────────────────────────────────┐ │ ┌───────────────────────────────┐ │
│ │ Fram ng đánh giá: FR-MI-04           │ │ │✓ 1. Chính xác (Accuracy) 4.5/5│ │
│ │ Đã xác thực SQLite                   │ │ │ ▓▓▓▓▓▓▓▓▓░ [ghi chú]        │ │
│ └──────────────────────────────────────┘ │ │▣ 2. Chiều sâu (Depth)   3.8/5  │ │
│                                          │ │▣ 3. Lập luận (Reasoning) 4.3/5 │ │
│                                          │ │▣ 4. Giao tiếp (Comm.)    4.4/5  │ │
│                                          │ │▣ 5. Nhận biết đánh đổi   3.6/5  │ │
│                                          │ └───────────────────────────────┘ │
├──────────────────────────────────────────┴─────────────────────────────────┤
│ ▣ 3 ĐIỂM MẠNH CỤ THỂ (Đã kiểm chứng) │ ▣ 3 ĐIỂM YẾU CẦN KHẮC PHỤC NGAY │
│ ┌──────────────────────────────────┐ │ ┌──────────────────────────────────┐ │
│ │✓ Tách đọc–ghi theo CQRS         │ │ │⚠ Câu 4: SLA & Latency Failover  │ │
│ │  "Tôi tách theo hướng ghi và     │ │ │  Chưa làm rõ SLA chấp nhận được  │ │
│ │   hướng đọc..."                  │ │ │  Đề xuất: Sentinel tuning...     │ │
│ │  Nhận xét AI: phân tích đúng     │ │ ├──────────────────────────────────┤ │
│ │  bài toán read-heavy.            │ │ │⚠ Câu 5: Định lượng dung lượng   │ │
│ └──────────────────────────────────┘ │ └──────────────────────────────────┘ │
├──────────────────────────────────────────┴─────────────────────────────────┤
│ ▣ ĐỒNG BỘ TIẾN ĐỘ HỌC TẬP (FR-MI-08)                                     │
│ Đề xuất luyện tiếp trỏ về Cây Kỹ Năng của bạn   [Mở toàn bộ cây năng lực→]│
│ ┌─────────────────────────────┐ ┌─────────────────────────────┐          │
│ │ Kỹ năng: Lựa chọn giải pháp │ │ Kỹ năng: Phân tích yêu cầu   │          │
│ │ [Hiện 0 bằng chứng]          │ │ [Hiện 2 bằng chứng]         │          │
│ │ [⚡ Tạo 3 bài tập về đánh    │ │ [✎ Thực hành viết PRD hệ     │          │
│ │      đổi kiến trúc]          │ │    thống cache]               │          │
│ └─────────────────────────────┘ └─────────────────────────────┘          │
├────────────────────────────────────────────────────────────────────────────┤
│ 💾 Dữ liệu phiên đã được lưu ngoại tuyến vào SQLite nội bộ.               │
│ [🧠 Luyện tập điểm yếu hôm nay]  [✓ Tạo bằng chứng kỹ năng]              │
└────────────────────────────────────────────────────────────────────────────┘
```

**Điểm khác biệt so với prototype:** bỏ "Phân vị ứng viên (Top 12%)" và "Độ tin cậy dữ liệu 98.4%" — vi phạm P7 (vanity metric), không truy được về `Skill` nào (NFR-MI-11).

### 6.4 Bảng thành phần

#### S16

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Breadcrumb chip | `FR-MI-01` / `MOCK INTERVIEW SYSTEM` / `CẤU HÌNH THÍCH ỨNG ADAPTIVE` | `font-label-sm text-label-sm uppercase tracking-wider`; chip 1 `bg-surface-container-high text-primary`; chip 3 `bg-secondary-container/30 text-secondary border border-secondary/20` | Tĩnh |
| Tiêu đề trang | "Thiết Lập Phiên Phỏng Vấn Kỹ Năng Chuyên Môn" | `font-headline-lg text-headline-lg text-on-surface font-bold` | Mobile: `font-headline-lg-mobile` |
| Phụ đề | Mô tả cơ chế lấy câu hỏi từ cây kỹ năng | `font-body-md text-body-md text-on-surface-variant` | Nhấn "Cây kỹ năng" bằng `text-primary font-medium` |
| Trạng thái local | "Local Vector Store: Đồng bộ 100%" | `bg-surface-container-low text-on-surface-variant font-label-md`; chấm tròn `bg-primary animate-ping` | Phản ánh DB local, không phải vector store thật → ghi "SQLite cục bộ" |
| Card hồ sơ (chọn) | Nhãn, `language`, `seniority`, số dạng câu, số skill, số phiên, điểm TB | `bg-surface-container-high ring-1 ring-primary/40`; tên `font-headline-sm text-on-surface font-bold`; badge "Đang chọn" `text-primary` + chấm `bg-primary` | Click chọn; điểm TB = trung bình `totalScore` các phiên `done` cùng hồ sơ |
| Card hồ sơ (không chọn) | Như trên | `bg-surface-container-low opacity-80 hover:bg-surface-container hover:opacity-100` | Click chọn |
| Nút tạo hồ sơ | "+ Tạo hồ sơ vai trò mới" | `text-primary font-label-md` + icon `add_box` | Mở modal form (jobTitle, seniority, language, questionKinds, focusSkills) |
| Nút chỉnh node | "Tùy chỉnh chọn node thủ công" | `text-secondary font-label-md hover:underline` + icon `tune` | Bật chế độ chọn tay trên cây kỹ năng (modal chọn node) |
| Banner smart focus | "Hệ thống đã ghim N node yếu nhất…" + lý do thuật toán | `bg-surface-container-lowest`; icon `auto_awesome text-primary`; số node `text-primary font-semibold` | Nội dung lý do sinh từ query §5.7, **không** ghi "FSRS Decay Rate" (không có thật) |
| Card node yếu | Tên node, mô tả, số bằng chứng, level, vị trí | `bg-surface-container rounded-lg`; badge P0 `bg-error-container text-on-error-container`; badge P1 `bg-tertiary-container text-on-tertiary-container`; score `font-code-md text-primary` | Ưu tiên P0 = 0 bằng chứng, P1 = 1–2 bằng chứng |
| Chip dạng câu (bật) | Icon `check_circle` + nhãn | `bg-surface-container-high text-primary font-body-sm font-semibold rounded-lg` | Toggle |
| Chip dạng câu (tắt) | Icon `radio_button_unchecked` + nhãn | `bg-surface-container text-on-surface-variant opacity-60` | Toggle; phải bật ≥1 |
| Option độ dài | 5 / 8 / 12 câu | Chọn: `bg-surface-container-high ring-1 ring-primary/30`, số `text-primary`; chip "Khuyến nghị" `bg-primary/10 text-primary font-label-sm` | Radio `accent-primary`; 8 là mặc định |
| Option trả lời | Văn bản / Giọng nói | Chọn: `bg-surface-container-high`; radio `accent-primary` | `voice` cần kiểm tra hỗ trợ STT → nếu không có thì disable kèm lý do |
| Toggle thông minh | Adaptive Loop · Đo tiếng Anh song song | Checkbox `accent-primary` / `accent-secondary`; nhãn chính `text-on-surface font-semibold` | Adaptive bật mặc định (FR-MI-06); Đo tiếng Anh = FR-MI-14, chỉ khả dụng khi `language='en'` |
| Card rubric | 5 tiêu chí kỹ thuật + mô tả | Hàng `bg-surface-container rounded`; chấm tròn 3px `bg-primary`/`bg-secondary`/`bg-tertiary`; mô tả `text-outline font-label-sm` | Tĩnh, read-only (P4) |
| Card ước tính AI | Độ dài, cache hit, latency, chi phí | `font-label-md text-label-md`; giá trị `text-on-surface font-bold`; chi phí `font-code-md text-primary font-bold` | Chi phí tính động theo số câu chọn |
| Card CTA | "Khởi Chạy Buồng Phỏng Vấn" | `bg-surface-container-high`; nút `bg-primary-container text-on-primary font-code-md font-bold` + glow emerald; icon `play_arrow` | Click → `POST /api/interview/start` → điều hướng `/interview/session?session=<id>` |

#### S17

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Header phiên | Chip `FR-MI-01 · LIVE SESSION`, vai trò, ngôn ngữ | `bg-surface-container-high text-primary font-label-md`; vai trò `bg-secondary-container/30 text-secondary`; ngôn ngữ `text-tertiary` + icon `translate` | Tĩnh |
| Tiêu đề | "Phiên Phỏng Vấn Thích Ứng · Câu N/M" | `font-headline-md text-headline-md font-bold text-on-surface` | Cập nhật mỗi lượt |
| Đồng hồ | Thời gian câu hiện tại / tổng | `font-code-md text-code-md text-tertiary` (tabular) | Timer client, reset khi chuyển câu |
| Nút tạm dừng | "Tạm dừng & Lưu" | `bg-surface-container-high text-on-surface-variant` + icon `pause_circle` | `PATCH` trạng thái → `paused`, hiện modal resume |
| Nút flag | "Flag" | `bg-surface-container-high text-error` + icon `flag` | `POST /api/interview/flag` (FR-MI-11) |
| Track 8 ô | Mỗi ô: Q#, icon trạng thái, thanh tiến độ, điểm | Đã xong `bg-surface-container` + icon `check_circle text-primary`; đang thi `bg-surface-container-highest` + `radio_button_checked text-primary`; chờ `bg-surface-container-low opacity-60` + `hourglass_empty` | Q8 là ô "Tổng kết" (icon `lock`) |
| Card interviewer | Avatar, tên model, badge, nút TTS | Nền `bg-surface-container-low rounded-xl p-gutter-lg shadow-md`; badge `bg-secondary-container/40 text-secondary font-label-sm uppercase` | Avatar: dùng icon `neurology` trong `bg-surface-container-high rounded-xl` — **không** dùng ảnh remote (P6, offline) |
| Câu hỏi | Nội dung câu hỏi | `font-body-lg text-body-lg text-on-surface leading-relaxed` trong `bg-surface-container rounded-xl p-gutter` | Stream từ AI-11/12 nếu bật streaming |
| Chip kỹ năng | Đường dẫn kỹ năng + cờ yếu | `bg-secondary-container/30 text-secondary font-label-sm`; cờ `bg-tertiary-container/30 text-tertiary` + icon `priority_high` | Bấm → mở S04 |
| Panel điểm câu trước | Tổng + 4–5 tiêu chí dạng thanh | `bg-surface-container-low`; chip tổng `bg-primary/10 text-primary font-label-sm font-bold`; thanh track `bg-surface-container-high` fill `bg-primary`/`bg-tertiary`/`bg-secondary` | Chỉ hiện **điểm**, không diễn giải dài (SPEC S17) |
| Ghi chú thích ứng | Lý do AI sinh câu này | `bg-secondary-container/20 rounded-xl`; icon `psychology text-secondary`; nhãn `text-secondary uppercase` | 1–2 câu |
| Panel phát âm | Waveform + trạng thái STT | `bg-surface-container-lowest rounded-xl`; thanh `bg-primary/40…90 animate-pulse` | Ẩn hoàn toàn khi `answerMode='text'` |
| Card trả lời | Toolbar + textarea + footer | `bg-surface-container-low rounded-xl p-gutter-lg shadow-md` | — |
| Toolbar | code / bullets / fx / STT | Icon button `p-2 rounded hover:bg-surface-container text-on-surface-variant`; nút STT `bg-surface-container text-tertiary font-label-md` | Ghi code/list vào textarea; STT toggle `bg-error-container text-on-error-container animate-pulse` khi đang ghi |
| Textarea | Nhập trả lời | `bg-surface-container-lowest rounded-xl p-gutter font-code-md text-code-md text-on-surface` + `focus:outline-none` | `rows=9`, `resize-y`; focus ring `focus-visible:ring-2 focus-visible:ring-primary` |
| Footer textarea | Số từ, thời gian gõ, autosave, phím tắt | `font-label-sm text-label-sm text-outline`; autosave `text-primary` + icon `cloud_done`; kbd `bg-surface-container rounded` | Autosave cục bộ `localStorage` mỗi 800ms |
| Nút gợi ý STAR | "Xem lại gợi ý cấu trúc (STAR)" | `bg-surface-container text-on-surface-variant font-label-md` | Mở panel gợi ý **chỉ cho câu `behavioral`**; không hiện nội dung đáp án |
| Nút xóa | "Xóa làm lại" | `bg-surface-container text-outline hover:text-error` | Xoá nội dung textarea, không xoá turn |
| Nút gửi | "Gửi câu trả lời & AI chấm tiếp" | `bg-primary-container text-on-primary font-code-md font-bold` + glow emerald + icon `arrow_forward` | Khi đang chấm: `opacity-75 cursor-not-allowed` + icon `refresh animate-spin` |
| Nút "Xem kết quả" | Xuất hiện khi đủ câu | `bg-primary-container text-on-primary` | Điều hướng `/interview/<id>` |

#### S18

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Header báo cáo | Loại báo cáo, model, vị trí, ngày, số câu, thời lượng | Chip `bg-surface-container text-primary font-label-sm uppercase`; tiêu đề `font-headline-lg text-headline-lg text-on-surface font-bold`; meta `font-label-md text-label-md text-on-surface-variant` + icon | Tĩnh |
| Nút xuất | "Xuất báo cáo PDF/JSON" | `bg-surface-container-high text-on-surface font-label-md` + icon `download` | Phase 1: xuất **JSON**; PDF = placeholder disabled kèm ghi chú "Phase 2" |
| Nút làm lại | "Làm lại với hồ sơ này" | `bg-primary-container text-on-primary font-label-md font-semibold` + icon `refresh` | Điều hướng `/interview/setup` với `profileId` đã chọn |
| Card tổng điểm | Điểm tổng + delta + khung đánh giá | `bg-surface-container-lowest rounded-xl p-space-xl`; số `font-display text-display text-on-surface`; delta `bg-primary-fixed-dim/15 text-primary font-label-md` | Delta so với phiên trước **cùng hồ sơ**; nếu chưa có phiên trước → hiện "Phiên đầu tiên — chưa có dữ liệu so sánh" |
| Card rubric 5 tiêu chí | Tên, điểm, thanh, ghi chú | `bg-surface-container rounded-lg p-space-md`; icon `verified`/`layers`/`schema`/`forum`/`balance`; thanh track `bg-surface-container-highest h-2`, fill `bg-primary` (≥4.0) hoặc `bg-tertiary` (<4.0) | Fill đổi màu theo ngưỡng 4.0; điểm `font-label-md font-bold` |
| Panel 3 điểm mạnh | Tiêu đề mạnh, trích dẫn, nhận xét AI | `bg-surface-container-low rounded-xl p-space-xl`; icon tròn `bg-primary/10 text-primary`; trích dẫn `bg-surface-container-lowest rounded font-code-md text-code-md italic` | `quote` là **nguyên văn** từ `answer` của turn tương ứng (phải khớp, không bịa) |
| Panel 3 điểm yếu | Tiêu đề, số câu, nhận xét, đề xuất | `bg-surface-container-low`; icon tròn `bg-tertiary/10 text-tertiary`; tag câu `font-label-md text-tertiary` + icon `warning`; tag phụ `bg-surface-container-highest text-outline font-label-sm` | `turnIndex` → link mở lại lượt đó trong transcript |
| Panel đề xuất luyện | Node kỹ năng + số bằng chứng + hành động | `bg-surface-container-high rounded-xl p-space-xl`; nhãn `text-secondary uppercase`; node `bg-surface-container rounded-lg`; badge 0 bằng chứng `bg-error-container text-on-error-container`; badge >0 `bg-surface-container-highest text-secondary`; nút hành động `bg-secondary text-on-secondary-fixed font-label-md font-semibold` | Hành động tạo `PlanItem` cho ngày mai (slot chuyên môn = 0) |
| Footer hành động | Xác nhận lưu SQLite + 2 nút | `bg-surface-container-lowest rounded-xl p-space-lg`; icon `save text-primary`; nút chính `bg-primary-container text-on-primary` | "Tạo bằng chứng kỹ năng" đã tự động chạy khi phiên `done` → nút chuyển thành trạng thái đã tạo |

### 6.5 Trạng thái

| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|
| **Chưa có hồ sơ** | `InterviewProfile.count() === 0` | S16: empty state trong section Hồ sơ — icon `badge`, text "Chưa có hồ sơ vai trò nào", nút chính "+ Tạo hồ sơ vai trò mới" (CTA duy nhất được enable). Các section khác (kỹ năng trọng tâm, cấu hình) hiển thị skeleton mờ. |
| **Chưa có kỹ năng chuyên môn** | `focusSkills` rỗng hoặc cây kỹ năng domain `professional` rỗng | Banner smart focus: "Cây kỹ năng chuyên môn đang trống — [Tạo kỹ năng đầu tiên →]" (link S03). Nút "Bắt đầu" disable kèm lý do. |
| **Chưa có bằng chứng nào** | Tất cả node có `evidenceCount = 0` | Vẫn chọn node yếu nhất (0 bằng chứng) và hiển thị badge `bg-error-container` "0 bằng chứng" — **không** hiển thị "chưa có dữ liệu" trống rỗng. |
| **Đang sinh câu hỏi** | AI-11 đang chạy | S17: khung câu hỏi hiện skeleton 3 dòng + shimmer `bg-surface-container-highest`; nút gửi disable; badge "AI đang soạn câu hỏi…". |
| **Đang chấm** | AI-12 đang chạy | Nút gửi: `opacity-75 cursor-not-allowed` + `refresh animate-spin` + text "AI đang phân tích & chấm điểm…"; panel điểm câu trước hiện skeleton 4 thanh. |
| **Đang tổng hợp báo cáo** | AI-13 đang chạy | S18: khối "3 mạnh / 3 yếu / đề xuất" skeleton; khối điểm rubric vẫn hiện (đã có từ dữ liệu turn, không phụ thuộc AI-13). |
| **Phiên bị bỏ dở / tạm dừng** | `status ∈ {paused, abandoned}` | S16 hiện banner "Bạn có 1 phiên đang dở với hồ sơ này — [Tiếp tục phiên 3/8]" ở đầu trang. S17 mở ra hiện modal "Tiếp tục phiên?" với 2 lựa chọn: Tiếp tục / Bỏ phiên. |
| **Resume** | Người dùng chọn tiếp tục | Khôi phục đúng `turn` đang dang dở (câu chưa có `answer`), đồng hồ câu chạy lại từ 0, lịch sử lượt trước hiển thị ở chế độ đọc. |
| **Hết câu** | `askedCount >= plannedCount` và tất cả đã trả lời | Nút gửi biến thành "Xem kết quả →" → `/interview/[id]`. Track hiện đủ 8/8 ô xanh. |
| **Lỗi AI** | 401 / 429 / 5xx / timeout / refusal | Toast trong S17: "AI chưa phản hồi được. Câu trả lời của bạn **đã được lưu**." + nút "Thử lại". Ghi `AiCall{ok:false}`. |
| **Thiếu API key** | `!process.env.ANTHROPIC_API_KEY` | S16: nút "Bắt đầu" ẩn, thay bằng card "Thêm API key trong Cài đặt để chạy phỏng vấn" + link S15. Toàn bộ phần cấu hình + rubric + kỹ năng yếu vẫn hiển thị bình thường. |
| **Không có phiên trước để so sánh** | Chưa có phiên `done` nào cùng `profileId` | S18: khối delta hiện "Phiên đầu tiên với hồ sơ này — chưa có dữ liệu so sánh" (không hiện `+0.0`). |
| **Hồ sơ bị xoá** | `profileId` không còn tồn tại | Xảy ra khi phiên đã bị cascade xoá cùng hồ sơ → route S18 trả 404 với nút "Về cấu hình". Nếu phiên còn mà hồ sơ mất (dữ liệu nhập tay), hiện "Hồ sơ đã bị xoá — vị trí hiển thị: (không rõ)". |
| **STT không hỗ trợ** | Trình duyệt không có `SpeechRecognition` | Nút "Giọng nói" ở S16 disable kèm lý do "Trình duyệt này không hỗ trợ nhận giọng nói — dùng văn bản". Ở S17, nếu đã chọn `voice` từ phiên cũ, fallback tự động sang văn bản kèm cảnh báo. |

### 6.6 Edge case

| Case | Xử lý |
|---|---|
| **Câu trả lời rỗng** | Nút "Gửi" disable khi `trim().length === 0` (nút xám, `aria-disabled`). Không gọi API. Hiện nhắc nhỏ "Câu trả lời trống — hãy trả lời ít nhất một câu". |
| **Trả lời quá dài** (> 3000 ký tự) | Textarea có `maxLength=3000`, hiển thị bộ đếm chuyển `text-tertiary` khi ≥ 2500 ký tự. Server cắt báo cáo cho AI về 2000 ký tự đầu + 500 ký tự cuối, kèm dấu `[...bị cắt...]` — **không** làm mất dữ liệu gốc trong DB. |
| **AI trả follow-up khi không cần** | Server kiểm tra `nextQuestion` mới: nếu `isFollowUp=true` nhưng điểm câu vừa rồi ≥ 4.2 ở **mọi** tiêu chí ≥ 3.5 → hạ `isFollowUp=false` và ép chuyển sang node yếu kế tiếp. Ghi log `adaptiveReason` để truy vết. |
| **AI trả câu hỏi không có node kỹ năng** | `nextSkillId` không thuộc `skillsFocused` → bỏ `nextSkillId`, gắn `skillId` = node yếu kế tiếp theo thuật toán §5.7, ghi cảnh báo vào log (không lộ ra UI). |
| **Người dùng dừng giữa chừng** | Nút "Tạm dừng & Lưu" → `status='paused'`, `endedAt` vẫn null. Toàn bộ lượt đã trả lời đã lưu. Quay lại S16 thấy banner resume; mở lại S17 khôi phục đúng vị trí. |
| **Refresh trang giữa phiên** | Toàn bộ lượt đã lưu server-side → reload S17 vẽ lại từ `InterviewTurn`. Câu đang trả lời dở khôi phục từ `localStorage` (autosave 800ms) nếu có, nếu không thì để trống + khôi phục lựa chọn chế độ trả lời. Không mất lượt nào đã chấm. |
| **Double-click nút gửi** | Disable nút ngay khi bấm + `useRef` chặn request trùng (`inFlightRef`). Server chặn bằng `index` duy nhất trong session (race → `409`, UI báo "Câu này đã được gửi"). |
| **Không có bằng chứng nào để chọn kỹ năng yếu** | Không có "chỗ yếu" → mọi node có 0 bằng chứng → thuật toán §5.7 chọn theo `level` thấp rồi `name` (khoá ổn định). UI hiện badge "0 bằng chứng" cho node được ghim, kèm chú thích "Đây là các kỹ năng chưa có bằng chứng nào — bài kiểm tra đầu tiên của bạn". |
| **Hồ sơ bị xoá nhưng còn phiên cũ** | Cascade của Prisma xoá phiên cùng hồ sơ → không còn phiên. Nếu dữ liệu bị nhập tay (JSON) khiến phiên mồ côi → `GET /api/interview/[id]` trả `404 profile_missing`; UI S18 hiện "Hồ sơ của phiên này đã bị xoá — báo cáo vẫn xem được, nhưng không so sánh được với phiên trước". |
| **Người dùng chọn 0 dạng câu** | Nút "Bắt đầu" disable + nhắc "Chọn ít nhất 1 dạng câu". Backend cũng từ chối (`400`). |
| **`focusSkills` chứa node đã xoá** | Lọc bỏ node không còn tồn tại khi đọc hồ sơ. Nếu hết → fallback: chọn 2 node `professional` có ít bằng chứng nhất trong toàn cây. |
| **Phiên có 12 câu nhưng người dùng dừng ở câu 5** | `askedCount=5`, `plannedCount=12`, `status='paused'`. S18 **không** mở được (chưa `done`). Hiện CTA "Xem kết quả tạm thời" chỉ chấm các câu đã trả lời, ghi rõ "kết quả tạm thời — 5/12 câu". |
| **AI-13 trả về <3 hoặc >3 mạnh/yếu** | Cắt còn đúng 3 (lấy 3 cái đầu theo thứ tự AI trả); nếu <3 → điền bằng mục suy ra từ rubric thấp nhất, **có gắn nhãn "tự động tóm tắt"** để không giả lập trích dẫn. Trích dẫn phải là nguyên văn từ `answer` → verify bằng `answer.includes(quote)`, không khớp thì bỏ trích dẫn (chỉ giữ nhận xét). |
| **Điểm ngoài thang 0–5** | Server clamp về [0,5] và ghi log lỗi schema. Không hiển thị giá trị ngoài thang. |
| **Hai thiết bị mở cùng 1 phiên** | Mỗi lượt có `index` duy nhất → thiết bị thứ hai gửi cùng `index` bị `409`. UI: "Phiên này đã được ghi ở nơi khác — tải lại để tiếp tục". |

---

## 7. Hợp đồng API

Quy ước chung (tech.md §5): validate bằng Zod, trả `{ ok: true, data }` hoặc `{ ok: false, error }`.

| Method | Route | Input | Output | Lỗi |
|---|---|---|---|---|
| GET | `/api/interview/profiles` | — | `{ profiles: InterviewProfileView[], total }` | — |
| POST | `/api/interview/profiles` | `{ label, jobTitle, seniority, language, questionKinds[], focusSkills[], answerMode, englishClarity }` | `{ profile: InterviewProfileView }` | `400` zod · `409` trùng `label` |
| PATCH | `/api/interview/profiles/[id]` | `{ label?, jobTitle?, seniority?, language?, questionKinds?, focusSkills?, answerMode?, englishClarity? }` | `{ profile }` | `400` · `404` |
| DELETE | `/api/interview/profiles/[id]` | — | `{ deleted: true }` | `404` |
| GET | `/api/interview/weak-skills?profileId=&count=2` | profileId, count | `{ skills: WeakSkillView[] }` — `{ skillId, name, evidenceCount, avgRating, level, path }` | `400` |
| POST | `/api/interview/start` | `{ profileId, plannedCount, questionKinds[], focusSkills[], answerMode, englishClarity, adaptive }` | `{ sessionId, firstTurn: InterviewTurnView }` | `400` zod · `404` profile · `409` đã có phiên `active` cùng hồ sơ · `no_api_key` |
| POST | `/api/interview/turn` | `{ sessionId, turnIndex, answer }` | `{ turn: InterviewTurnView, nextTurn: InterviewTurnView \| null, session: { askedCount, status } }` | `400` · `404` session · `409` index trùng / đã pause · `no_api_key` · `429` · `refusal` |
| POST | `/api/interview/report` | `{ sessionId }` | `{ report: InterviewReport }` | `404` · `409` chưa đủ câu · `no_api_key` · `429` |
| GET | `/api/interview/[id]` | — | `{ session, profile, turns[], report, activity, evidence, previousSession, deltas }` | `404` session không tồn tại hoặc chưa `done` |
| GET | `/api/interview/sessions?profileId=&status=&limit=` | profileId, status, limit | `{ sessions: SessionSummary[], total }` | `400` |
| POST | `/api/interview/flag` | `{ turnId, reason? }` | `{ flagged: true }` | `400` · `404` turn |
| PATCH | `/api/interview/sessions/[id]` | `{ status: "paused" \| "active" \| "abandoned" }` | `{ session: { id, status, askedCount } }` | `400` · `404` · `409` phiên đã `done` |
| GET | `/api/interview/[id]/export` | — | file JSON (self-contained) | `404` |

**Ghi chú về `POST /api/interview/turn`:** đây là endpoint AI-12 — **1 call = chấm + sinh câu tiếp**. Response trả cả `turn` (điểm câu vừa trả lời) lẫn `nextTurn` (câu kế tiếp đã sinh sẵn) để UI không phải gọi thêm.

**Ghi chú về `GET /api/interview/[id]`:** trả kèm `deltas` — chênh lệch điểm từng tiêu chí so với phiên `done` gần nhất cùng `profileId` (FR-MI-09). Phiên trước được tìm bằng `startedAt < current.startedAt AND status='done' AND profileId = X`, lấy `ORDER BY startedAt DESC LIMIT 1`.

---

## 8. Tiêu chí nghiệm thu

### AC-9 — Mock Interview chấm đúng rubric

- *Given* một phiên 8 câu đã trả lời đủ, *When* mở `/interview/<id>`, *Then* **mỗi câu** có đủ **5 tiêu chí** `accuracy`/`depth`/`reasoning`/`communication`/`tradeoff` với điểm trong `[0,5]` kèm `note` không rỗng, **điểm tổng của phiên = trung bình các tiêu chí**, và báo cáo có **đúng 3 điểm mạnh + 3 điểm yếu**. **Không** tiêu chí nào ngoài rubric.
- *Given* người dùng trả lời hời hợt ở câu 1, *When* AI sinh câu 2, *Then* câu 2 là **follow-up của câu 1** (cùng chủ đề, đào sâu thêm — `isFollowUp=true`, `skillId` giống nhau), **không** nhảy sang câu mới.
- *Given* một câu `behavioral`, *When* xem điểm câu đó, *Then* có đủ **4 tiêu chí** `specific`/`star`/`selfaware`/`outcome` trong `behavioralScores`, và không có tiêu chí nào ngoài 4.

### AC-10 — Mock Interview hỏi đúng chỗ yếu

- *Given* cây kỹ năng có "Lựa chọn giải pháp" (0 bằng chứng) và "Phân tích yêu cầu" (2 bằng chứng) trong `focusSkills`, *When* mở `/interview/setup`, *Then* node **"Lựa chọn giải pháp"** được ghim là node yếu nhất (badge P0, "0 bằng chứng") và đứng trước "Phân tích yêu cầu".
- *Given* kết quả trả về của query §5.7, *When* so sánh với thứ tự đếm tay trong test, *Then* thứ tự `evidenceCount` tăng dần khớp tuyệt đối.

### AC-13 — So sánh được giữa các lần

- *Given* 2 phiên `done` cùng hồ sơ vai trò "Backend Engineer" (phiên 1: 3.5/5.0, phiên 2: 4.1/5.0), *When* mở báo cáo phiên thứ 2, *Then* hiển thị **delta từng tiêu chí** so với phiên thứ 1 (ví dụ `Chính xác ▲ +0.5`) và **delta điểm tổng** `▲ +0.6`.
- *Given* phiên thứ 2 thuộc hồ sơ **khác**, *When* mở báo cáo, *Then* **không** hiện delta (so sánh chỉ trong cùng hồ sơ) và hiện "Phiên đầu tiên với hồ sơ này".
- *Given* chỉ có 1 phiên `done`, *When* mở báo cáo, *Then* hiện "Chưa có phiên trước để so sánh" thay vì `+0.0`.

### AC-MI-14 — Phiên dừng giữa chừng & resume (FR-MI-13)

- *Given* đang ở câu 3/8, *When* bấm "Tạm dừng & Lưu", *Then* `InterviewSession.status='paused'`, **mọi lượt đã trả lời vẫn còn nguyên**, và S16 hiện banner "Tiếp tục phiên 3/8".
- *Given* phiên đã `paused`, *When* bấm "Tiếp tục", *Then* S17 mở đúng câu 3 với lịch sử lượt 1–2 ở chế độ đọc, đồng hồ câu chạy lại từ 0.

### AC-MI-15 — Ghi Activity + Evidence (FR-MI-10)

- *Given* phiên `done` với điểm tổng 4.1 và skill trọng tâm "Lựa chọn giải pháp", *When* báo cáo được tạo, *Then* có **đúng 1** `Activity` với `domain='professional'`, `type='mock_interview'`, `aiScore=4.1`, `skillId` = skill trọng tâm, và **đúng 1** `Evidence` trỏ tới `Activity` đó với `skillId` tương ứng, `rating` trong `[1,4]`.
- *Given* mở lại báo cáo phiên đó, *When* reload trang, *Then* **không** tạo thêm Activity/Evidence thứ hai (idempotent).

### AC-MI-16 — Báo cáo có trích dẫn thật (FR-MI-08)

- *Given* báo cáo có 3 điểm mạnh, *When* kiểm tra mỗi trích dẫn, *Then* trích dẫn là **nguyên văn** một đoạn có trong `InterviewTurn.answer` của câu được dẫn (`answer.includes(quote)` = true). Nếu AI trả trích dẫn không khớp → hệ thống bỏ trích dẫn và chỉ giữ nhận xét, không hiển thị sai lệch.

### AC-MI-17 — Điểm yếu có số câu (FR-MI-08)

- *Given* báo cáo có 3 điểm yếu, *When* render, *Then* mỗi điểm yếu hiển thị **số câu** cụ thể (ví dụ "Câu 4") và bấm vào sẽ mở đúng lượt đó trong transcript.

### AC-MI-18 — Đề xuất luyện trỏ đúng Skill (FR-MI-08)

- *Given* skill trọng tâm có 0 bằng chứng, *When* render khối "Đề xuất luyện tiếp", *Then* hiển thị đúng tên skill, badge số bằng chứng hiện tại, và nút hành động tạo `PlanItem` cho ngày mai ở slot chuyên môn (slot 0) với `source='manual'`, `skillId` đúng.

### AC-MI-19 — Chi phí 1 call / lượt (NFR-MI-02)

- *Given* một phiên 8 câu hoàn thành, *When* đếm `AiCall` có `feature='mock_interview'`, *Then* tổng số call = **9** (1 lần AI-11 + 8 lần AI-12). Không có call chấm riêng lẻ nào.

### AC-MI-20 — Câu hỏi có vấn đề (FR-MI-11)

- *Given* đang ở giữa phiên, *When* bấm nút "Flag" trên câu hiện tại, *Then* `InterviewTurn.flagged=true` và ghi 1 bản ghi log cải thiện sinh câu hỏi (kèm `turnId`, `sessionId`, lý do) đọc được trong log AI; UI hiện xác nhận "Đã ghi nhận — cảm ơn bạn đã giúp cải thiện".

---

## 9. Rủi ro riêng của feature

| # | Rủi ro | Xác suất | Tác động | Giảm thiểu |
|---|---|---|---|---|
| R-MI-1 | **Câu hỏi chung chung** — AI hỏi kiểu "Giải thích cách hoạt động của hệ phân tán" cho mọi người (R8 của SPEC) | Trung bình | Cao | Bắt buộc truyền `focusSkills` + `jobTitle` + `seniority` + `skillId` của từng câu vào prompt. Mỗi `InterviewTurn` lưu `skillId` → đo được tỉ lệ câu hỏi trúng node. Nếu tỉ lệ flag > 10% → siết prompt. |
| R-MI-2 | **Điểm không ổn định** — cùng 1 câu trả lời, 2 lần chấm khác nhau (R9) | Trung bình | Trung bình | `temperature` mặc định không cao; rubric chi tiết kèm mô tả; lưu điểm từng tiêu chí kèm `note` để người dùng tự phản biện. Chấp nhận sai số ±0.3 (ghi trong UI dưới dạng ghi chú nhỏ). |
| R-MI-3 | **Chi phí tăng nhanh** — mỗi lượt gửi lại toàn bộ lịch sử (R11) | Thấp | Trung bình | Lịch sử **chỉ append** (giữ được cache prefix) · `effort: medium` cho lượt chấm · `high` chỉ cho báo cáo cuối · ghi `AiCall` để theo dõi. Xem `design.md` §3.4. |
| R-MI-4 | **AI bịa trích dẫn câu trả lời** trong 3 điểm mạnh → người dùng mất niềm tin vào cả báo cáo | Trung bình | Cao | Verify `answer.includes(quote)` trước khi lưu; không khớp thì bỏ trích dẫn, chỉ giữ nhận xét. Không bao giờ hiển thị trích dẫn không tồn tại trong transcript. |
| R-MI-5 | **Báo cáo đẹp nhưng không hành động được** — 3 điểm yếu chung chung kiểu "cần đào sâu hơn" | Trung bình | Trung bình | Mỗi điểm yếu bắt buộc có `turnIndex` (số câu) + `suggestion` cụ thể. Đề xuất luyện phải trỏ tới `Skill` thật và tạo được `PlanItem`. |
| R-MI-6 | **Mất phiên khi refresh / đóng tab** giữa chừng | Trung bình | Cao | Mỗi lượt ghi server-side ngay khi chấm xong; textarea autosave `localStorage` mỗi 800ms; `askedCount` tăng ngay khi sinh câu nên câu chưa trả lời không bị "mất". |
| R-MI-7 | **Người dùng bị "chấm điểm" nhưng không biết cải thiện thế nào** → bỏ dùng sau 2–3 lần | Trung bình | Cao | Trong phiên chỉ hiện **điểm** (không diễn giải dài) để không mất tập trung; **diễn giải chi tiết dồn về S18** với 3 mạnh / 3 yếu / đề xuất hành động cụ thể. |
| R-MI-8 | **Vanity metric trong prototype** ("Top 12%", "Độ tin cậy dữ liệu 98.4%") vi phạm P7 | Cao | Trung bình | Đã loại khỏi spec. Mọi số trên S18 phải trả lời được "đo cái gì, để làm gì" — nếu không thì không hiển thị (NFR-MI-11). |
| R-MI-9 | **Hồ sơ nhiều gây loạn** — 5 hồ sơ vai trò, mỗi hồ sơ một bộ câu hỏi | Trung bình | Thấp | S16 hiển thị card theo lưới 3 cột, mỗi card có số phiên + điểm TB để người dùng chọn đúng hồ sơ. Không giới hạn cứng, nhưng cảnh báo khi > 10 hồ sơ. |
| R-MI-10 | **Phiên `paused` tích tụ** gây rối | Trung bình | Thấp | S16 chỉ hiện banner resume cho phiên `paused`/`abandoned` gần nhất; các phiên cũ hơn 7 ngày tự ẩn khỏi banner (vẫn xem được trong S18). |
