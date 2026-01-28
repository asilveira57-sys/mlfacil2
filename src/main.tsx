import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (import.meta.env.DEV) {
  (window as any).__APP_BOOT_COUNT__ = ((window as any).__APP_BOOT_COUNT__ ?? 0) + 1;
  // eslint-disable-next-line no-console
  console.info(
    `[BOOT] main.tsx render count=${(window as any).__APP_BOOT_COUNT__} @ ${new Date().toISOString()}`,
  );
}

createRoot(document.getElementById("root")!).render(<App />);
