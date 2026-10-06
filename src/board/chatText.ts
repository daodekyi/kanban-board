/**
 * Bộ phân tích định dạng tối giản cho tin nhắn của trợ lý.
 *
 * Model trả về markdown nhẹ (gạch đầu dòng và **in đậm**). Không kéo cả thư
 * viện markdown về chỉ vì hai thứ đó: nội dung ở đây do model sinh ra nên càng
 * ít khả năng render càng ít chỗ để nó chèn thứ ta không lường trước (link,
 * ảnh, HTML thô). Hỗ trợ đúng những gì hướng dẫn trong Worker yêu cầu.
 */

export interface Segment {
  text: string;
  bold: boolean;
}

export interface Line {
  kind: "bullet" | "text";
  segments: Segment[];
}

/** Tách một dòng thành các đoạn theo cặp dấu `**`. */
function parseBold(raw: string): Segment[] {
  const segments: Segment[] = [];
  let rest = raw;

  while (rest.length > 0) {
    const open = rest.indexOf("**");
    if (open === -1) break;
    const close = rest.indexOf("**", open + 2);
    // Dấu ** lẻ (không có cặp đóng) là ký tự bình thường, không phải định dạng.
    if (close === -1) break;

    if (open > 0) segments.push({ text: rest.slice(0, open), bold: false });
    const inner = rest.slice(open + 2, close);
    if (inner) segments.push({ text: inner, bold: true });
    rest = rest.slice(close + 2);
  }

  if (rest) segments.push({ text: rest, bold: false });
  return segments;
}

export function parseChatText(text: string): Line[] {
  return text.split("\n").map((raw) => {
    const trimmed = raw.trimStart();
    // Chấp nhận cả "- " và "* " vì model dùng lẫn lộn cả hai.
    const isBullet = /^[-*]\s+/.test(trimmed);
    const content = isBullet ? trimmed.replace(/^[-*]\s+/, "") : raw;
    return { kind: isBullet ? "bullet" : "text", segments: parseBold(content) };
  });
}
