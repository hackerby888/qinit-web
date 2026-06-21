// Structured logging. One JSON line per event ({ level, ts, msg, ...fields }) to stdout/stderr so logs are
// machine-parseable in production; a compact human form when not in production. LOG_LEVEL filters. formatLine
// is pure → unit-tested.
export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const MIN_LEVEL = ORDER[(process.env.LOG_LEVEL as LogLevel)] ?? ORDER.info;
const PRETTY = process.env.NODE_ENV !== "production";

export type LogFields = Record<string, unknown>;

// Render one log event. JSON in production (parseable); a terse "ts LEVEL msg key=val" line otherwise.
export function formatLine(level: LogLevel, msg: string, fields: LogFields | undefined, ts: number, pretty: boolean): string {
  if (!pretty) {
    return JSON.stringify({ level, ts: new Date(ts).toISOString(), msg, ...fields });
  }

  const extra = fields && Object.keys(fields).length > 0 ? " " + Object.entries(fields).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ") : "";
  return `${new Date(ts).toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}${extra}`;
}

function emit(level: LogLevel, msg: string, fields?: LogFields): void {
  if (ORDER[level] < MIN_LEVEL) {
    return;
  }

  const line = formatLine(level, msg, fields, Date.now(), PRETTY);
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(line + "\n");
}

export const log = {
  debug: (msg: string, fields?: LogFields): void => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields): void => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields): void => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields): void => emit("error", msg, fields),
};
