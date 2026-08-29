import { useCallback, useEffect, useState } from "react";

export function useElementWidth<T extends HTMLElement>(): [
  (node: T | null) => void,
  number | null,
] {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  const ref = useCallback((next: T | null) => {
    setNode(next);
  }, []);

  useEffect(() => {
    if (!node) {
      return;
    }
    if (typeof ResizeObserver === "undefined") {
      setWidth(node.getBoundingClientRect().width);
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(node);
    setWidth(node.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, [node]);

  return [ref, width];
}
