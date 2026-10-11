// A loud, persistent bar across the top while the browser is offline — so a lost connection isn't a silent
// "nothing saves and I don't know why". Driven by the window online/offline events. Rendered on both pages.
import { useEffect, useState } from "react";
import { color, font } from "../ui/tokens";
import { BACKEND_ENABLED } from "./backend";

export function OfflineBanner() {
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && navigator.onLine === false);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // nothing syncs without the backend, so there is nothing to warn about
  if (!offline || !BACKEND_ENABLED) {
    return null;
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 26, background: "#f85149", color: color.void, fontFamily: font.mono, fontSize: 11.5, fontWeight: 600, letterSpacing: ".02em" }}>
      <span>⚠ You're offline — changes won't sync until you reconnect.</span>
    </div>
  );
}
