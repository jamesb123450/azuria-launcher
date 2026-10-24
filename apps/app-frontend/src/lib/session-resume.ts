// Retry saved-session verification on reconnect/resume, without background polling
// or opening an interactive sign-in flow.
export function sessionResume(
  eligible: () => boolean,
  retry: () => Promise<unknown>,
  target?: EventTarget,
) {
  const surface = target ?? (typeof window !== "undefined" ? window : null);
  if (!surface) return () => {};
  let previous = -Infinity;
  function attempt() {
    if (!eligible() || Date.now() - previous < 30_000) return;
    previous = Date.now();
    void retry().catch(() => {});
  }
  surface.addEventListener("online", attempt);
  surface.addEventListener("focus", attempt);
  return () => {
    surface.removeEventListener("online", attempt);
    surface.removeEventListener("focus", attempt);
  };
}
