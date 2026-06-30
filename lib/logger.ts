/* eslint-disable no-console */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: LogLevel =
  process.env.NODE_ENV === "production" ? "info" : "debug";

function log(level: LogLevel, scope: string, message: string, meta?: unknown) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const prefix = `[financial-os:${scope}]`;
  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  if (meta !== undefined) {
    fn(prefix, message, meta);
  } else {
    fn(prefix, message);
  }
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, meta?: unknown) =>
      log("debug", scope, message, meta),
    info: (message: string, meta?: unknown) => log("info", scope, message, meta),
    warn: (message: string, meta?: unknown) => log("warn", scope, message, meta),
    error: (message: string, meta?: unknown) =>
      log("error", scope, message, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
