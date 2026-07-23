type LogLevel = "info" | "warn" | "error";

type StructuredLogData = Record<string, unknown>;

function normalizeError(error: unknown) {
  if (!(error instanceof Error)) return { message: String(error) };
  return {
    name: error.name,
    message: error.message,
    ...(error.cause ? { cause: String(error.cause) } : {}),
  };
}

export function structuredLog(
  level: LogLevel,
  event: string,
  data: StructuredLogData = {},
) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  });

  console[level](payload);
}

export function logUiFailure(error: unknown, data: StructuredLogData = {}) {
  structuredLog("error", "ui.render.failure", {
    error: normalizeError(error),
    ...data,
  });
}
