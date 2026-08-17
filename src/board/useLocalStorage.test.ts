import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorage } from "./useLocalStorage";

describe("useLocalStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns initialValue when nothing stored", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", { a: 1 }));
    expect(result.current[0]).toEqual({ a: 1 });
  });

  it("persists updates to localStorage and reflects them", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", { a: 1 }));
    act(() => {
      result.current[1]({ a: 2 });
    });
    expect(result.current[0]).toEqual({ a: 2 });
    expect(JSON.parse(window.localStorage.getItem("test-key")!)).toEqual({ a: 2 });
  });

  it("falls back to initialValue when stored data is invalid JSON", () => {
    window.localStorage.setItem("test-key", "not-json{");
    const { result } = renderHook(() => useLocalStorage("test-key", { a: 1 }));
    expect(result.current[0]).toEqual({ a: 1 });
  });
});
