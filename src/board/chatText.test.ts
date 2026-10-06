import { describe, expect, it } from "vitest";
import { parseChatText } from "./chatText";

describe("parseChatText", () => {
  it("giữ nguyên dòng thường", () => {
    expect(parseChatText("Xin chào")).toEqual([
      { kind: "text", segments: [{ text: "Xin chào", bold: false }] },
    ]);
  });

  it("nhận cả gạch đầu dòng '-' và '*'", () => {
    const lines = parseChatText("- một\n* hai");
    expect(lines.map((l) => l.kind)).toEqual(["bullet", "bullet"]);
    expect(lines[0].segments[0].text).toBe("một");
    expect(lines[1].segments[0].text).toBe("hai");
  });

  it("tách phần in đậm ra khỏi phần thường", () => {
    expect(parseChatText("Board **Kanban** có 5 thẻ")).toEqual([
      {
        kind: "text",
        segments: [
          { text: "Board ", bold: false },
          { text: "Kanban", bold: true },
          { text: " có 5 thẻ", bold: false },
        ],
      },
    ]);
  });

  it("gạch đầu dòng có in đậm ở ngay đầu", () => {
    const [line] = parseChatText("- **To Do**: 5 thẻ");
    expect(line.kind).toBe("bullet");
    expect(line.segments).toEqual([
      { text: "To Do", bold: true },
      { text: ": 5 thẻ", bold: false },
    ]);
  });

  it("dấu ** lẻ được coi là ký tự thường, không nuốt mất nội dung", () => {
    const [line] = parseChatText("giá **rẻ");
    expect(line.segments.map((s) => s.text).join("")).toBe("giá **rẻ");
    expect(line.segments.every((s) => !s.bold)).toBe(true);
  });

  it("dòng trống vẫn là một dòng, để giữ khoảng cách đoạn", () => {
    expect(parseChatText("a\n\nb")).toHaveLength(3);
  });
});
