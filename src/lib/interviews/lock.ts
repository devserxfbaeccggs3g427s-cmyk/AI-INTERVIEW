/**
 * Khoá theo phiên trong RAM — §8.1.
 *
 * Vấn đề: hai request `/turn` cho cùng một phiên sẽ cùng đọc lịch sử, cùng gọi
 * model, rồi cùng append. Hai câu hỏi được trả về cho cùng một câu trả lời, hai
 * lượt `user` cùng `seq` khiến `UNIQUE (session_id, seq)` nổ, và tiền điện bị
 * trả hai lần cho một câu trả lời. Khoá ở DB (`BEGIN IMMEDIATE`) không cứu được vì
 * khoảng thời gian cần bảo vệ là **giữa** lúc đọc và lúc ghi — lúc đó không giữ
 * transaction nào.
 *
 * Vì sao khoá trong RAM chấp nhận được: ứng dụng chạy một tiến trình Node, một
 * tiến trình ghi (§8.1 "Ghi đồng thồng thời"). Nếu sau này chạy nhiều tiến trình,
 * đây là chỗ phải thay bằng `session_id` ở tầng DB — và `appendExchange()` vẫn
 * đúng vì nó kiểm `MAX(seq)` trong transaction.
 */

const held = new Set<string>();

/**
 * Chiếm khoá cho `sessionId`, hoặc báo `false` nếu đang có request khác giữ nó.
 *
 * Trả về một hàm giải phóng thay vì tự giải phóng trong `finally` bên trong: kẻ gọi
 * phải giữ khoá **xuyên suốt** lúc gọi model, không chỉ lúc ghi DB, và chỉ kẻ gọi mới
 * biết khoá đi hết khi nào.
 */
export function acquireSessionLock(sessionId: string): (() => void) | null {
  if (held.has(sessionId)) return null;
  held.add(sessionId);
  return () => {
    held.delete(sessionId);
  };
}

/** Chỉ cho probe và test — không phải đường của mã sản phẩm. */
export function isSessionLocked(sessionId: string): boolean {
  return held.has(sessionId);
}