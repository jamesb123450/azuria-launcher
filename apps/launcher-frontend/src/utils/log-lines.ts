export type LogLevel = "info" | "warn" | "error" | "debug";
export function logLines(text: string) {
  let level: LogLevel = "info";
  return text.split(/\r?\n/).map((message, index) => {
    const match = message.match(
      /(?:\b|\/)(INFO|WARN|WARNING|ERROR|FATAL|DEBUG|TRACE)(?=\b|\])/i,
    );
    if (match) {
      const value = match[1]!.toLowerCase();
      level =
        value === "fatal"
          ? "error"
          : value === "warning"
            ? "warn"
            : value === "trace"
              ? "debug"
              : (value as LogLevel);
    }
    return { number: index + 1, message, level };
  });
}
export function visibleLog(text: string, cleared: string) {
  return cleared && text.startsWith(cleared)
    ? text.slice(cleared.length).replace(/^\r?\n/, "")
    : text;
}
