import { describe, expect, it } from "vitest";
import { splitLeadingNumber } from "./columnTitle";

describe("splitLeadingNumber", () => {
  it("reads a number followed by a dot", () => {
    expect(splitLeadingNumber("1. To Do")).toEqual({ number: "1", rest: "To Do" });
  });

  it("reads a number separated by only a space", () => {
    expect(splitLeadingNumber("5 Test")).toEqual({ number: "5", rest: "Test" });
  });

  it("reads a number followed by a closing paren", () => {
    expect(splitLeadingNumber("2) In Progress")).toEqual({ number: "2", rest: "In Progress" });
  });

  it("leaves a title with no leading number alone", () => {
    expect(splitLeadingNumber("Backlog")).toEqual({ number: null, rest: "Backlog" });
  });

  it("does not treat a year as a position number", () => {
    expect(splitLeadingNumber("2026 Roadmap")).toEqual({ number: null, rest: "2026 Roadmap" });
  });

  it("does not split a number that runs into the word", () => {
    expect(splitLeadingNumber("5Test")).toEqual({ number: null, rest: "5Test" });
  });
});
