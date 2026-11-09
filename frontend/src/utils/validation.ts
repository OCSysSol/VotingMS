/** Returns true if the string passes a basic email format check. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Formats API errors (e.g. from FastAPI 422 responses or Error objects)
 * into a human-readable string without raw JSON or internal exception dumps.
 */
export function formatApiErrorMessage(rawMessage: string | Error | null | undefined): string {
  if (!rawMessage) return "";
  const msg = typeof rawMessage === "string" ? rawMessage : rawMessage.message;
  if (!msg) return "";

  // Check if string matches "HTTP <status>: <json>"
  const match = msg.match(/^HTTP (\d+):\s*([\s\S]*)$/);
  if (!match) return msg;

  const statusCode = match[1];
  const jsonPayload = match[2].trim();

  try {
    const data = JSON.parse(jsonPayload);
    if (data && typeof data === "object") {
      if (statusCode === "422" || Array.isArray(data.detail)) {
        if (typeof data.detail === "string") {
          return data.detail;
        }
        if (Array.isArray(data.detail)) {
          return data.detail
            .map((item: { msg?: string; loc?: Array<string | number> }) => {
              if (!item || typeof item !== "object") return "Validation error";
              return (item.msg ?? "Validation error").replace(/^Value error,\s*/i, "");
            })
            .join("; ");
        }
      }
    }
  } catch {
    // Not JSON, return original msg
  }

  return msg;
}
