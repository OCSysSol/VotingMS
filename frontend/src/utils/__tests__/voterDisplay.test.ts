import { describe, expect, it } from "vitest";
import { formatVoterIdentity } from "../voterDisplay";

describe("formatVoterIdentity", () => {
  it("labels admin-entered ballots as Floor vote", () => {
    expect(formatVoterIdentity({
      voter_email: "admin",
      submitted_by_admin: true,
    })).toBe("Floor vote");
  });

  it("formats a named direct voter", () => {
    expect(formatVoterIdentity({
      voter_name: "Jane Smith",
      voter_email: "jane@example.com",
    })).toBe("Jane Smith <jane@example.com>");
  });

  it("formats an unnamed proxy voter", () => {
    expect(formatVoterIdentity({
      voter_email: "proxy@example.com",
      proxy_email: "proxy@example.com",
    })).toBe("proxy@example.com (proxy)");
  });

  it("returns an empty label when no identity fields exist", () => {
    expect(formatVoterIdentity({})).toBe("");
  });
});
