"use strict";
/*
 * GitHub Date Format - yyyy/MM/dd HH:mm
 * - Finds GitHub's <relative-time>, <time-ago> and <local-time> elements
 * - Replaces each with a plain <time> element showing the absolute local
 *   date/time formatted as yyyy/MM/dd HH:mm (e.g. 2026/11/23 01:18)
 * - Replacing (not just re-texting) the element stops GitHub's component
 *   from overwriting the label back to a relative time on its next tick.
 * - A MutationObserver re-applies this to content GitHub loads later
 *   (SPA navigation, infinite scroll, opened menus, etc.).
 */

const SELECTOR = "relative-time, time-ago, local-time";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDate(d) {
  return (
    `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

function convertElement(el) {
  const iso = el.getAttribute("datetime");
  if (!iso) return;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return;

  const time = document.createElement("time");
  time.setAttribute("datetime", iso);
  // Keep GitHub's own classes so surrounding layout/typography is unchanged.
  if (el.getAttribute("class")) time.setAttribute("class", el.getAttribute("class"));
  if (el.getAttribute("title")) time.setAttribute("title", el.getAttribute("title"));
  time.dataset.gdfFormatted = "1";
  time.textContent = formatDate(d);
  el.replaceWith(time);
}

function scan(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll(SELECTOR).forEach(convertElement);
  // The root itself may be a matching element (added-node case).
  if (scope instanceof Element && scope.matches && scope.matches(SELECTOR)) {
    convertElement(scope);
  }
}

let scanQueued = false;
function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(() => {
    scanQueued = false;
    scan(document);
  });
}

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.addedNodes && m.addedNodes.length > 0) {
      queueScan();
      return;
    }
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });
scan(document);
