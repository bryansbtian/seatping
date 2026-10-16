import { useEffect, useRef } from "react";

function isHidden() {
  return document.visibilityState === "hidden";
}

export function useVisiblePolling(
  refresh: (signal: AbortSignal) => Promise<void>,
  intervalMs: number,
  enabled = true,
  refreshKey?: string,
) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let recoveryPending = false;
    let wasHidden = isHidden();

    const run = async () => {
      if (controller.signal.aborted || isHidden()) {
        return;
      }
      if (running) {
        recoveryPending = true;
        return;
      }
      clearTimeout(timer);
      running = true;
      try {
        await refreshRef.current(controller.signal);
      } catch {
      } finally {
        running = false;
        if (!controller.signal.aborted && !isHidden()) {
          if (recoveryPending) {
            recoveryPending = false;
            void run();
          } else {
            timer = setTimeout(run, intervalMs);
          }
        }
      }
    };
    const onVisibility = () => {
      const hidden = isHidden();
      if (hidden) {
        clearTimeout(timer);
        recoveryPending = false;
      } else if (wasHidden) {
        void run();
      }
      wasHidden = hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);
    void run();
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs, refreshKey]);
}
