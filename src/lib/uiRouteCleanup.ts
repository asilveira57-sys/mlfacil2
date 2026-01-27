type CleanupReason = string;

function dispatchEscape(times = 2) {
  for (let i = 0; i < times; i++) {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  }
}

function clearBodyScrollLock() {
  const body = document.body;
  const html = document.documentElement;

  // Radix / various libs may set these.
  body.style.overflow = "";
  body.style.paddingRight = "";
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.width = "";
  body.style.pointerEvents = "";

  html.style.overflow = "";
  html.style.paddingRight = "";
  html.style.position = "";
}

function clearStaleAriaHidden() {
  // If any modal is still open, do not mess with aria-hidden.
  const hasAnyOpen = !!document.querySelector('[data-radix-portal] [data-state="open"]');
  if (hasAnyOpen) return;

  // Radix sets aria-hidden="true" on siblings of the portal to trap focus.
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("body > *[aria-hidden='true']"));
  for (const el of candidates) {
    // Keep aria-hidden inside portals intact.
    if (el.closest("[data-radix-portal]")) continue;
    el.removeAttribute("aria-hidden");
  }

  const root = document.getElementById("root");
  if (root?.getAttribute("aria-hidden") === "true") root.removeAttribute("aria-hidden");
}

function isFullscreenFixed(el: HTMLElement) {
  const style = window.getComputedStyle(el);
  if (style.position !== "fixed") return false;
  if (style.pointerEvents === "none") return false;

  const rect = el.getBoundingClientRect();
  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);

  const coversW = rect.width >= vw * 0.9;
  const coversH = rect.height >= vh * 0.9;
  return coversW && coversH;
}

function removeOrphanedRadixPortals() {
  // If anything is explicitly open, don't touch portals.
  const hasAnyOpen = !!document.querySelector('[data-radix-portal] [data-state="open"]');
  if (hasAnyOpen) return;

  const portals = Array.from(document.querySelectorAll<HTMLElement>("[data-radix-portal]"));
  for (const portal of portals) {
    // Heuristic: remove only portals that contain a fullscreen fixed element
    // (typical of overlays) that could block clicks.
    const descendants = Array.from(portal.querySelectorAll<HTMLElement>("*"));
    let foundBlocking = false;

    // Hard cap per portal to avoid pathological cases.
    for (let i = 0; i < descendants.length && i < 250; i++) {
      const el = descendants[i];
      if (isFullscreenFixed(el)) {
        foundBlocking = true;
        break;
      }
    }

    if (foundBlocking) {
      portal.remove();
    }
  }
}

export function performGlobalUiCleanup(reason: CleanupReason) {
  // 1) Ask any open Radix primitives to close.
  dispatchEscape(3);

  // 2) Release stuck scroll locks.
  clearBodyScrollLock();

  // 3) Fix stale aria-hidden (focus-trap leftovers).
  clearStaleAriaHidden();

  // 4) Remove orphaned portals that can block clicks.
  removeOrphanedRadixPortals();

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(`[UI-Cleanup] executed (${reason})`);
  }
}

export function describeElement(el: Element | null) {
  if (!el || !(el instanceof HTMLElement)) return String(el);
  const parts = [el.tagName.toLowerCase()];
  if (el.id) parts.push(`#${el.id}`);
  const cls = (el.className || "").toString().trim();
  if (cls) parts.push(`.${cls.split(/\s+/).slice(0, 6).join(".")}`);
  const ds = el.getAttribute("data-state");
  if (ds) parts.push(`[data-state=${ds}]`);
  if (el.closest("[data-radix-portal]")) parts.push("(in radix portal)");
  return parts.join("");
}

export function isSuspiciousClickBlocker(el: Element | null) {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.closest("[data-radix-portal]")) {
    // Most of our real blockers come from portals.
    return isFullscreenFixed(el) || !!el.querySelector("[data-state]");
  }
  return isFullscreenFixed(el);
}
