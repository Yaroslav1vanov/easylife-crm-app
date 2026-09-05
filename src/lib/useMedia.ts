"use client";
import { useEffect, useState } from "react";

/** true на телефоне (< 768px). До монтирования — false, чтобы SSR-разметка совпадала. */
export function useIsMobile(bp = 768): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${bp - 1}px)`);
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [bp]);
  return m;
}
