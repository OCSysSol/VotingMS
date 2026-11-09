import { describe, it, expect } from "vitest";
import { isValidEmail, formatApiErrorMessage, MOTION_LIMITS, getCounterClass } from "../validation";

describe("MOTION_LIMITS", () => {
  it("defines correct MAX and WARN thresholds for all motion fields", () => {
    expect(MOTION_LIMITS.TITLE).toEqual({ MAX: 500, WARN: 450 });
    expect(MOTION_LIMITS.MOTION_NUMBER).toEqual({ MAX: 50, WARN: 45 });
    expect(MOTION_LIMITS.DESCRIPTION).toEqual({ MAX: 5000, WARN: 4500 });
    expect(MOTION_LIMITS.OPTION_TEXT).toEqual({ MAX: 1000, WARN: 900 });
  });
});

describe("getCounterClass", () => {
  it("returns base class when length is below warn threshold (< 90%)", () => {
    expect(getCounterClass(0, 500, 450)).toBe("field__counter");
    expect(getCounterClass(449, 500, 450)).toBe("field__counter");
  });

  it("returns warning class when length is between warn and max inclusive (>= 90% and <= 100%)", () => {
    expect(getCounterClass(450, 500, 450)).toBe("field__counter field__counter--warning");
    expect(getCounterClass(499, 500, 450)).toBe("field__counter field__counter--warning");
    expect(getCounterClass(500, 500, 450)).toBe("field__counter field__counter--warning");
  });

  it("returns error class when length exceeds max threshold (> 100%)", () => {
    expect(getCounterClass(501, 500, 450)).toBe("field__counter field__counter--error");
    expect(getCounterClass(600, 500, 450)).toBe("field__counter field__counter--error");
  });
});

describe("isValidEmail", () => {
  // --- Happy path ---

  it("returns true for a standard email address", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("returns true for an email with a subdomain", () => {
    expect(isValidEmail("user@mail.example.com")).toBe(true);
  });

  it("returns true for an email with a + in the local part", () => {
    expect(isValidEmail("user+tag@example.com")).toBe(true);
  });

  it("returns true for an email with dots in the local part", () => {
    expect(isValidEmail("first.last@example.org")).toBe(true);
  });

  it("returns true for an email with leading/trailing whitespace (trimmed)", () => {
    expect(isValidEmail("  user@example.com  ")).toBe(true);
  });

  // --- Input validation ---

  it("returns false for a string with no @ symbol", () => {
    expect(isValidEmail("notanemail")).toBe(false);
  });

  it("returns false for a string missing the domain", () => {
    expect(isValidEmail("user@")).toBe(false);
  });

  it("returns false for a string missing the TLD separator (no dot after @)", () => {
    expect(isValidEmail("user@domain")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("returns false for a string with only whitespace", () => {
    expect(isValidEmail("   ")).toBe(false);
  });

  // --- Boundary values ---

  it("returns false for a string with whitespace in the local part", () => {
    expect(isValidEmail("user name@example.com")).toBe(false);
  });

  it("returns false for a string with whitespace in the domain part", () => {
    expect(isValidEmail("user@exam ple.com")).toBe(false);
  });

  it("returns true for a single-character local part", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
  });

  // --- Edge cases ---

  it("returns false for a string with only @", () => {
    expect(isValidEmail("@")).toBe(false);
  });

  it("returns false for a string with @ at the start", () => {
    expect(isValidEmail("@example.com")).toBe(false);
  });

  it("returns false for multiple @ symbols", () => {
    expect(isValidEmail("a@@b.com")).toBe(false);
  });
});

describe("formatApiErrorMessage", () => {
  it("returns empty string when input is null or undefined or empty", () => {
    expect(formatApiErrorMessage(null)).toBe("");
    expect(formatApiErrorMessage(undefined)).toBe("");
    expect(formatApiErrorMessage("")).toBe("");
    expect(formatApiErrorMessage(new Error(""))).toBe("");
  });

  it("returns raw message if not matching HTTP status pattern", () => {
    expect(formatApiErrorMessage("Network error")).toBe("Network error");
    expect(formatApiErrorMessage(new Error("Network error"))).toBe("Network error");
  });

  it("parses string detail from HTTP JSON response", () => {
    const raw = 'HTTP 422: {"detail": "Meeting is closed"}';
    expect(formatApiErrorMessage(raw)).toBe("Meeting is closed");
  });

  it("parses validation array detail with motion loc and formats human-readable string", () => {
    const rawMotionTitle = 'HTTP 422: {"detail":[{"loc":["body","motions",0,"title"],"msg":"String should have at most 500 characters"}]}';
    expect(formatApiErrorMessage(rawMotionTitle)).toBe("Motion 1: Title - String should have at most 500 characters");

    const rawMotionDesc = 'HTTP 422: {"detail":[{"loc":["body","motions",1,"description"],"msg":"String should have at most 5000 characters"}]}';
    expect(formatApiErrorMessage(rawMotionDesc)).toBe("Motion 2: Description - String should have at most 5000 characters");

    const rawMotionNum = 'HTTP 422: {"detail":[{"loc":["body","motions",2,"motion_number"],"msg":"String should have at most 50 characters"}]}';
    expect(formatApiErrorMessage(rawMotionNum)).toBe("Motion 3: Motion number - String should have at most 50 characters");
  });

  it("parses validation array detail with nested option loc and strips 'Value error, '", () => {
    const raw = 'HTTP 422: {"detail":[{"loc":["body","motions",0,"options",0,"text"],"msg":"Value error, option text must not exceed 1000 characters","type":"value_error"}]}';
    expect(formatApiErrorMessage(raw)).toBe("Motion 1, Option 1: Option text - option text must not exceed 1000 characters");

    const rawOptNoField = 'HTTP 422: {"detail":[{"loc":["body","motions",0,"options",1],"msg":"Invalid option"}]}';
    expect(formatApiErrorMessage(rawOptNoField)).toBe("Motion 1, Option 2 - Invalid option");

    const rawMotionNoField = 'HTTP 422: {"detail":[{"loc":["body","motions",0],"msg":"Motion is required"}]}';
    expect(formatApiErrorMessage(rawMotionNoField)).toBe("Motion 1 - Motion is required");
  });

  it("parses direct option loc (e.g. from single motion add/edit)", () => {
    const rawDirectOpt = 'HTTP 422: {"detail":[{"loc":["options",0,"text"],"msg":"Value error, option text must not exceed 1000 characters"}]}';
    expect(formatApiErrorMessage(rawDirectOpt)).toBe("Option 1: Option text - option text must not exceed 1000 characters");

    const rawDirectOptNoField = 'HTTP 422: {"detail":[{"loc":["options",2],"msg":"Option is invalid"}]}';
    expect(formatApiErrorMessage(rawDirectOptNoField)).toBe("Option 3 - Option is invalid");
  });

  it("parses simple field loc without motions prefix", () => {
    const rawTitle = 'HTTP 422: {"detail":[{"loc":["body","title"],"msg":"Field required"}]}';
    expect(formatApiErrorMessage(rawTitle)).toBe("Title - Field required");

    const rawCustom = 'HTTP 422: {"detail":[{"loc":["custom_setting_name"],"msg":"Invalid setting"}]}';
    expect(formatApiErrorMessage(rawCustom)).toBe("Custom setting name - Invalid setting");

    const rawBodyOnly = 'HTTP 422: {"detail":[{"loc":["body"],"msg":"Body required"}]}';
    expect(formatApiErrorMessage(rawBodyOnly)).toBe("Body required");
  });

  it("formats multiple array detail items", () => {
    const raw = 'HTTP 422: {"detail":[{"loc":["body","title"],"msg":"Title is required"},{"loc":["body","options",0,"text"],"msg":"Value error, option text must not exceed 1000 characters"}]}';
    expect(formatApiErrorMessage(raw)).toBe("Title - Title is required; Option 1: Option text - option text must not exceed 1000 characters");
  });

  it("handles missing msg or invalid item in array detail or empty loc", () => {
    const raw = 'HTTP 422: {"detail":[null, {"loc":["text"]}, {"msg":"Simple error","loc":[]}]}';
    expect(formatApiErrorMessage(raw)).toBe("Validation error; Option text - Validation error; Simple error");
  });

  it("preserves status code prefix for non-422 errors", () => {
    const raw = 'HTTP 409: {"detail": "An open General Meeting already exists"}';
    expect(formatApiErrorMessage(raw)).toBe(raw);
  });

  it("returns raw message when JSON is invalid or not an object", () => {
    expect(formatApiErrorMessage("HTTP 500: Internal Server Error")).toBe("HTTP 500: Internal Server Error");
    expect(formatApiErrorMessage("HTTP 200: 12345")).toBe("HTTP 200: 12345");
  });
});
