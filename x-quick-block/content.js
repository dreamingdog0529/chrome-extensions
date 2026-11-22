"use strict";
/*
 * Twitter Blocker - 1-Click Quick Block
 * - Adds a 🚫 button to the top-right of every post (left of the "..." menu)
 * - Click = immediately block that post's author via X's own web API
 * - A toast with "取り消す" (Undo) is shown for 3 seconds
 * - On a successful block, every post by that author currently on screen is hidden
 * - No button on your own posts. On failure nothing is hidden and an error is shown.
 */

const BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const UNDO_MS = 3000;

// ---------- helpers ----------

function getCsrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function getOwnScreenName() {
  // The account switcher in the bottom-left of the sidebar shows your @handle.
  const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  if (switcher) {
    const m = switcher.textContent.match(/@([A-Za-z0-9_]{1,15})/);
    if (m) return m[1].toLowerCase();
  }
  const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
  if (profileLink) {
    const m = profileLink.getAttribute("href") || "";
    const name = m.replace(/^\//, "").split("/")[0];
    if (name) return name.toLowerCase();
  }
  return "";
}

function getAuthorScreenName(article) {
  // Main author of the post: the first profile link inside the User-Name block.
  const nameBlock = article.querySelector('[data-testid="User-Name"]');
  const scope = nameBlock || article;
  const links = scope.querySelectorAll('a[href^="/"][role="link"]');
  for (const a of links) {
    const href = a.getAttribute("href") || "";
    const m = href.match(/^\/([A-Za-z0-9_]{1,15})$/);
    if (m) return m[1];
    const simple = href.match(/^\/([A-Za-z0-9_]{1,15})(?:\/(?:status|with_replies|media|likes))?$/);
    if (simple && href.split("/").length <= 3) return simple[1];
  }
  return "";
}

async function blockApi(screenName, action) {
  // action: "create" = block, "destroy" = unblock (undo)
  const csrf = getCsrfToken();
  if (!csrf) throw new Error("not-logged-in");
  const res = await fetch(`${location.origin}/i/api/1.1/blocks/${action}.json`, {
    method: "POST",
    credentials: "include",
    headers: {
      authorization: `Bearer ${BEARER}`,
      "x-csrf-token": csrf,
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": "yes",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ screen_name: screenName, skip_status: "true" }),
  });
  if (!res.ok) throw new Error(`http-${res.status}`);
  return res;
}

// ---------- toast (undo / error) ----------

function toastContainer() {
  let c = document.getElementById("qb-toast-container");
  if (!c) {
    c = document.createElement("div");
    c.id = "qb-toast-container";
    document.body.appendChild(c);
  }
  return c;
}

function showUndoToast(screenName, hiddenArticles) {
  const toast = document.createElement("div");
  toast.className = "qb-toast";

  const label = document.createElement("span");
  label.textContent = `@${screenName} をブロックしました`;
  toast.appendChild(label);

  const undoBtn = document.createElement("button");
  undoBtn.className = "qb-undo-btn";
  undoBtn.type = "button";
  undoBtn.textContent = "取り消す";
  toast.appendChild(undoBtn);

  const bar = document.createElement("div");
  bar.className = "qb-toast-bar";
  toast.appendChild(bar);
  // Shrink the bar over the undo window so the remaining time is visible.
  requestAnimationFrame(() => {
    bar.style.transition = `width ${UNDO_MS}ms linear`;
    bar.style.width = "0%";
  });

  let done = false;
  const timer = setTimeout(() => dismiss(false), UNDO_MS);

  function dismiss(restored) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    toast.remove();
    if (!restored) {
      // Undo window closed: drop the references, posts stay hidden.
      hiddenArticles.length = 0;
    }
  }

  undoBtn.addEventListener("click", async (ev) => {
    if (!ev.isTrusted) return; // ignore synthetic clicks from page scripts
    if (done) return;
    undoBtn.disabled = true;
    undoBtn.textContent = "戻しています…";
    try {
      await blockApi(screenName, "destroy");
      for (const el of hiddenArticles) el.style.display = "";
      dismiss(true);
    } catch (e) {
      undoBtn.disabled = false;
      undoBtn.textContent = "取り消す";
      showErrorToast(`@${screenName} の取り消しに失敗しました`);
    }
  });

  toastContainer().appendChild(toast);
}

function showErrorToast(message) {
  const toast = document.createElement("div");
  toast.className = "qb-toast qb-toast-error";
  const label = document.createElement("span");
  label.textContent = message;
  toast.appendChild(label);
  toastContainer().appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ---------- block flow ----------

async function onQuickBlockClick(btn, article) {
  const screenName = btn.dataset.qbUser;
  if (!screenName || btn.disabled) return;
  btn.disabled = true;
  btn.classList.add("qb-busy");
  try {
    await blockApi(screenName, "create");
  } catch (e) {
    btn.disabled = false;
    btn.classList.remove("qb-busy");
    showErrorToast(
      e && e.message === "not-logged-in"
        ? "ログイン状態を確認できませんでした"
        : `@${screenName} をブロックできませんでした`
    );
    return;
  }
  // Success: hide every visible post by this author.
  const hidden = [];
  document.querySelectorAll("article").forEach((a) => {
    const author = getAuthorScreenName(a);
    if (author && author.toLowerCase() === screenName.toLowerCase()) {
      a.style.display = "none";
      hidden.push(a);
    }
  });
  showUndoToast(screenName, hidden);
}

// ---------- button injection ----------

function injectButton(article) {
  if (article.dataset.qbInjected === "1") return;
  const caret = article.querySelector('[data-testid="caret"]');
  if (!caret) return; // header not rendered yet; a later scan will retry
  const screenName = getAuthorScreenName(article);
  if (!screenName) return;
  const own = getOwnScreenName();
  article.dataset.qbInjected = "1";
  if (own && screenName.toLowerCase() === own) return; // never on your own posts

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "qb-block-btn";
  btn.dataset.qbUser = screenName;
  btn.title = `@${screenName} をブロック`;
  btn.setAttribute("aria-label", `@${screenName} をブロック`);
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  btn.addEventListener("click", (ev) => {
    if (!ev.isTrusted) return; // ignore synthetic clicks from page scripts
    ev.preventDefault();
    ev.stopPropagation();
    onQuickBlockClick(btn, article);
  });

  // Insert just left of the "..." (caret) button.
  caret.parentElement.insertBefore(btn, caret);
}

function updateTheme() {
  // X's theme shows in the page background: white = light, black/dark blue = dark.
  const bg = getComputedStyle(document.body).backgroundColor || "";
  const m = bg.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!m) return;
  const luminance =
    (0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3])) / 255;
  document.documentElement.classList.toggle("qb-dark", luminance < 0.5);
}

function scan() {
  updateTheme();
  document.querySelectorAll("article").forEach(injectButton);
}

let scanQueued = false;
function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(() => {
    scanQueued = false;
    scan();
  });
}

const observer = new MutationObserver(queueScan);
observer.observe(document.body, { childList: true, subtree: true });
scan();
