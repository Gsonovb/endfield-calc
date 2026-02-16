import { useSyncExternalStore } from "react";

function getMq(): MediaQueryList | null {
  if (typeof window === "undefined") return null;
  return window.matchMedia("(orientation: portrait)");
}

function subscribe(cb: () => void) {
  const mq = getMq();
  mq?.addEventListener("change", cb);
  return () => mq?.removeEventListener("change", cb);
}

function getSnapshot() {
  return getMq()?.matches ?? false;
}

export function usePortrait() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
