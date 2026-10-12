// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanKeywords, MAX_AUDIO_BYTES, transcribe } from "../src/transcribe";

afterEach(() => vi.unstubAllGlobals());

describe("cleanKeywords", () => {
  it("bỏ ký tự OpenAI cấm, trùng lặp và mục không có chữ", () => {
    expect(cleanKeywords(["Minh Anh", "minh anh", "<b>Review</b>", "a\nb", "...", 42, "  To   Do "])).toEqual([
      "Minh Anh",
      "b Review /b",
      "a b",
      "To Do",
    ]);
  });

  it("chặn số lượng và độ dài", () => {
    const many = Array.from({ length: 150 }, (_, i) => `Thẻ ${i}`);
    expect(cleanKeywords(many)).toHaveLength(100);
    expect(cleanKeywords(["x".repeat(200)])[0]).toHaveLength(60);
    expect(cleanKeywords("not-an-array")).toEqual([]);
  });
});

describe("transcribe", () => {
  it("gửi gpt-transcribe kèm ngôn ngữ và keyword, trả về chữ", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: " Thêm thẻ mua vé " })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribe("sk-test", new Blob(["abc"], { type: "audio/webm;codecs=opus" }), ["Đà Lạt"]);

    expect(result).toEqual({ ok: true, text: "Thêm thẻ mua vé" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("gpt-transcribe");
    expect(form.getAll("languages[]")).toEqual(["vi", "en"]);
    expect(form.getAll("keywords[]")).toEqual(["Đà Lạt"]);
    expect((form.get("file") as File).name).toBe("command.webm");
    expect(form.has("language")).toBe(false);
  });

  it("từ chối file rỗng hoặc quá lớn mà không gọi OpenAI", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await transcribe("k", new Blob([]), [])).ok).toBe(false);
    const big = new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)]);
    expect(await transcribe("k", big, [])).toMatchObject({ ok: false, status: 413 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("báo lỗi tiếng Việt khi OpenAI lỗi hoặc không nghe được gì", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await transcribe("k", new Blob(["a"]), [])).toMatchObject({ ok: false, status: 502 });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: "" }))));
    expect(await transcribe("k", new Blob(["a"]), [])).toMatchObject({ ok: false, status: 422 });
  });
});
