const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Câu báo cho model biết hôm nay là ngày nào, để "ngày mai", "thứ sáu tuần
 * này" ra đúng ngày thay vì để model đoán. Ngày lấy từ TRÌNH DUYỆT (giờ địa
 * phương của người dùng): Worker chạy theo UTC nên tối ở Việt Nam/Mỹ có thể
 * lệch một ngày. Thiếu hoặc sai định dạng thì mới rơi về ngày UTC của Worker.
 */
export function describeToday(today: unknown, timeZone: unknown, now: Date = new Date()): string {
  const date = typeof today === "string" && isRealDate(today) ? today : now.toISOString().slice(0, 10);
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  const zone =
    typeof timeZone === "string" && /^[A-Za-z_+\-/0-9]{1,64}$/.test(timeZone) ? `, múi giờ ${timeZone}` : "";
  return `Hôm nay là ${weekday}, ngày ${date}${zone}.`;
}
