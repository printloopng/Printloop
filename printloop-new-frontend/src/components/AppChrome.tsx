import { useEffect, useRef } from "react";

export function TabTitleNudge() {
  useEffect(() => {
    let saved = "";
    const onChange = () => {
      if (document.hidden) {
        if (!saved) saved = document.title;
        document.title = "↩ Your loop is still open";
      } else if (saved) {
        document.title = saved;
        saved = "";
      }
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return null;
}
