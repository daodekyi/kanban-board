// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { bearerToken, verifyUser } from "../src/auth";

const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" };

afterEach(() => vi.unstubAllGlobals());

describe("verifyUser", () => {
  it("trả về id user khi Supabase xác nhận token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "user-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyUser("tok", env)).toBe("user-1");
    expect(fetchMock).toHaveBeenCalledWith("https://x.supabase.co/auth/v1/user", {
      headers: { Authorization: "Bearer tok", apikey: "anon" },
    });
  });

  it("null khi Supabase trả 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    expect(await verifyUser("tok", env)).toBeNull();
  });

  it("null khi body không có id dạng chuỗi", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 5 }), { status: 200 })));
    expect(await verifyUser("tok", env)).toBeNull();
  });

  it("null và không gọi mạng khi token rỗng", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyUser("", env)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("null khi fetch ném lỗi mạng", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await verifyUser("tok", env)).toBeNull();
  });
});

describe("bearerToken", () => {
  it("bóc token khỏi header Authorization", () => {
    expect(bearerToken(new Request("https://w/", { headers: { Authorization: "Bearer abc" } }))).toBe("abc");
  });
  it("chuỗi rỗng khi không có header", () => {
    expect(bearerToken(new Request("https://w/"))).toBe("");
  });
});
