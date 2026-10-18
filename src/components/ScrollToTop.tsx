import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { key, hash, state } = useLocation();

  useLayoutEffect(() => {
    const navigationState: unknown = state;
    if (
      hash ||
      !navigationState ||
      typeof navigationState !== "object" ||
      !("scrollToTop" in navigationState) ||
      navigationState.scrollToTop !== true
    ) {
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [key, hash, state]);

  return null;
}
