import { describe, it, expect } from "vitest";
import { isValidEmail, formatApiErrorMessage } from "../validation";

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

  it("parses validation array detail from FastAPI 422 response and strips 'Value error, '", () => {
    const raw = 'HTTP 422: {"detail":[{"loc":["body","motions",0,"options",0,"text"],"msg":"Value error, option text must not exceed 1000 characters","type":"value_error"}]}';
    expect(formatApiErrorMessage(raw)).toBe("option text must not exceed 1000 characters");
  });

  it("formats multiple array detail items", () => {
    const raw = 'HTTP 422: {"detail":[{"msg":"Title is required"},{"msg":"Value error, option text must not exceed 1000 characters"}]}';
    expect(formatApiErrorMessage(raw)).toBe("Title is required; option text must not exceed 1000 characters");
  });

  it("handles missing msg or invalid item in array detail", () => {
    const raw = 'HTTP 422: {"detail":[null, {"loc":["text"]}]}';
    expect(formatApiErrorMessage(raw)).toBe("Validation error; Validation error");
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
