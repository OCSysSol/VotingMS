/** Returns true if the string passes a basic email format check. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export const MOTION_LIMITS = {
  TITLE: { MAX: 500, WARN: 450 },
  MOTION_NUMBER: { MAX: 50, WARN: 45 },
  DESCRIPTION: { MAX: 5000, WARN: 4500 },
  OPTION_TEXT: { MAX: 1000, WARN: 900 },
} as const;

export function getCounterClass(length: number, max: number, warn: number): string {
  if (length > max) return "field__counter field__counter--error";
  if (length >= warn) return "field__counter field__counter--warning";
  return "field__counter";
}

function formatFieldName(name: string | number): string {
  const str = String(name);
  if (str === "title") return "Title";
  if (str === "motion_number") return "Motion number";
  if (str === "description") return "Description";
  if (str === "option_limit") return "Option limit";
  if (str === "options") return "Options";
  if (str === "text") return "Option text";
  if (str === "motion_type") return "Motion type";
  return str.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function formatDetailItem(item: { msg?: string; loc?: Array<string | number> }): string {
  if (!item || typeof item !== "object") return "Validation error";
  const rawMsg = item.msg ?? "Validation error";
  const cleanMsg = rawMsg.replace(/^Value error,\s*/i, "");

  if (!item.loc || !Array.isArray(item.loc) || item.loc.length === 0) {
    return cleanMsg;
  }

  // Strip leading "body"
  const parts = item.loc[0] === "body" ? item.loc.slice(1) : item.loc;
  if (parts.length === 0) {
    return cleanMsg;
  }

  // Check for motions array: ["motions", index, ...]
  if (parts[0] === "motions" && parts.length > 1 && !isNaN(Number(parts[1]))) {
    const motionNum = Number(parts[1]) + 1;
    const rest = parts.slice(2);
    if (rest.length === 0) {
      return `Motion ${motionNum} - ${cleanMsg}`;
    }
    // Check for nested options: ["options", optIndex, ...]
    if (rest[0] === "options" && rest.length > 1 && !isNaN(Number(rest[1]))) {
      const optNum = Number(rest[1]) + 1;
      const optRest = rest.slice(2);
      if (optRest.length > 0) {
        return `Motion ${motionNum}, Option ${optNum}: ${formatFieldName(optRest[0])} - ${cleanMsg}`;
      }
      return `Motion ${motionNum}, Option ${optNum} - ${cleanMsg}`;
    }
    return `Motion ${motionNum}: ${formatFieldName(rest[0])} - ${cleanMsg}`;
  }

  // Check for direct options array: ["options", optIndex, ...]
  if (parts[0] === "options" && parts.length > 1 && !isNaN(Number(parts[1]))) {
    const optNum = Number(parts[1]) + 1;
    const rest = parts.slice(2);
    if (rest.length > 0) {
      return `Option ${optNum}: ${formatFieldName(rest[0])} - ${cleanMsg}`;
    }
    return `Option ${optNum} - ${cleanMsg}`;
  }

  // Check for simple field: [field]
  return `${formatFieldName(parts[0])} - ${cleanMsg}`;
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
            .map((item: { msg?: string; loc?: Array<string | number> }) => formatDetailItem(item))
            .join("; ");
        }
      }
    }
  } catch {
    // Not JSON, return original msg
  }

  return msg;
}
