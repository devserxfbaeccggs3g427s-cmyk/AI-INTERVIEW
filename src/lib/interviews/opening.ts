/**
 * Lệnh mở đầu phiên — nơi **duy nhất** sinh ra chuỗi này.
 *
 * Vì sao cần một hằng riêng thay vì để `start` tự chế câu: lượt `user` tổng hợp được
 * lưu vào `turns` và được phát lại ở **mọi** lượt sau (`messages[0]`). Nếu mỗi lần mở
 * phiên lại sinh ra một chuỗi khác nhau — dấu câu, thứ tự từ, khoảng trắng — thì mọi
 * lượt sau sẽ có tiền tố cache khác lượt trước, và hoá đơn tăng mà **không** có lỗi
 * nào báo (T-5.2, §5.5). Vì vậy chuỗi này là hằng, không phải chuỗi có nội suy.
 */

import type { Language } from "../providers/types";

const OPENING: Record<Language, string> = {
  vi: "Bắt đầu phỏng vấn.",
  en: "Begin the interview.",
};

export function openingInstruction(language: Language): string {
  return OPENING[language];
}