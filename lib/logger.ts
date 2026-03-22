// ============================================================
// Planit Logger — structured console output
// ============================================================

type LogLevel = "info" | "warn" | "error" | "debug" | "success";

const ICONS: Record<LogLevel, string> = {
  info:    "ℹ️ ",
  warn:    "⚠️ ",
  error:   "❌",
  debug:   "🔍",
  success: "✅",
};

function log(level: LogLevel, context: string, message: string, data?: unknown) {
  const prefix = `${ICONS[level]} [${context}]`;
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, typeof data === "string" ? data : JSON.stringify(data, null, 2));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export const logger = {
  info:    (ctx: string, msg: string, data?: unknown) => log("info",    ctx, msg, data),
  warn:    (ctx: string, msg: string, data?: unknown) => log("warn",    ctx, msg, data),
  error:   (ctx: string, msg: string, data?: unknown) => log("error",   ctx, msg, data),
  debug:   (ctx: string, msg: string, data?: unknown) => log("debug",   ctx, msg, data),
  success: (ctx: string, msg: string, data?: unknown) => log("success", ctx, msg, data),
};

// Extract JSON from Gemini responses robustly.
// Handles: raw JSON, ```json...```, ```...```, JSON embedded in prose.
// Uses split-based fence removal (not regex) to handle long payloads correctly.
export function extractJSON(text: string): unknown | null {
  // 1. Try to strip markdown code fences using split (handles long content)
  let candidate = text.trim();
  if (candidate.includes("```")) {
    // Split on ``` and take the content between the first pair
    const parts = candidate.split("```");
    // parts[0] = before first fence, parts[1] = content (possibly starting with "json\n"), parts[2] = after
    if (parts.length >= 3) {
      candidate = parts[1].replace(/^json\s*/i, "").trim();
    } else if (parts.length === 2) {
      candidate = parts[1].replace(/^json\s*/i, "").trim();
    }
  }

  // 2. Try direct parse of the whole candidate
  try { return JSON.parse(candidate); } catch { /* fall through */ }

  // 3. Find the first { and last } and try parsing that slice
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)); } catch { /* fall through */ }
  }

  // 4. Find the first [ and last ] (for arrays)
  const firstBracket = candidate.indexOf("[");
  const lastBracket = candidate.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try { return JSON.parse(candidate.slice(firstBracket, lastBracket + 1)); } catch { /* fall through */ }
  }

  return null;
}
