// Twitter/X SiteAdapter. Scrapes the Following / Followers lists at
//   x.com/<handle>/following  (and /followers, /verified_followers)
//
// X ships obfuscated class names but stable `data-testid` hooks. We key on
// `[data-testid="UserCell"]` and the bare `/username` profile links inside
// each cell. The list is aggressively virtualized (rows unmount as you
// scroll), so we harvest incrementally via window.SGE.scrollCollect.
//
// Wrapped in an IIFE so its helpers don't collide with other adapters.

(function () {
  "use strict";

  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  // Reserved first-path segments that look like a handle but aren't people.
  const RESERVED = new Set([
    "home", "explore", "notifications", "messages", "i", "settings",
    "search", "compose", "hashtag", "about", "tos", "privacy",
  ]);

  /** A bare "/username" href → handle, or null. X handles are 1–15 chars. */
  function handleFromHref(href) {
    const m = (href || "").match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
    if (!m) return null;
    return RESERVED.has(m[1].toLowerCase()) ? null : m[1];
  }

  function cells() {
    return [...document.querySelectorAll('[data-testid="UserCell"]')];
  }

  /** Which relationship does the current list represent? */
  function relationship() {
    const p = location.pathname;
    if (/\/(followers|verified_followers)(\/|$)/.test(p)) return "follower";
    if (/\/following(\/|$)/.test(p)) return "following";
    return null;
  }

  /** Bio: an element inside the cell (not a profile link, not the @handle)
   *  carrying free text. Best-effort — may need tuning against real markup. */
  function extractBio(cell, handle, name) {
    for (const el of cell.querySelectorAll('[dir="auto"], [dir="ltr"]')) {
      if (el.closest('a[role="link"], a[href]')) continue; // skip name/handle links
      const t = clean(el.textContent);
      if (!t || t.startsWith("@")) continue;
      if (name && t === name) continue;
      if (/^(follow|following|follows you|pending|unfollow)$/i.test(t)) continue;
      return t;
    }
    return null;
  }

  function extractCell(cell, rel) {
    let handle = null;
    let name = null;
    for (const a of cell.querySelectorAll('a[href]')) {
      const h = handleFromHref(a.getAttribute("href"));
      if (!h) continue;
      handle = handle || h;
      const t = clean(a.textContent);
      if (t && !t.startsWith("@") && !name) name = t;
    }
    if (!handle) return null;

    return {
      network: "twitter",
      profileUrl: `https://x.com/${handle}`, // canonical (works from x.com or twitter.com)
      username: handle,
      displayName: name || handle,
      headline: extractBio(cell, handle, name),
      company: null,
      location: null,
      connectionType: rel,
      connectedOn: null, // X doesn't expose a follow date
    };
  }

  /** Harvest current cells into `byHandle`, filling missing fields on repeats. */
  function harvest(byHandle) {
    const rel = relationship();
    for (const cell of cells()) {
      const rec = extractCell(cell, rel);
      if (!rec) continue;
      const key = rec.username.toLowerCase();
      const existing = byHandle.get(key);
      if (!existing) {
        byHandle.set(key, rec);
      } else {
        if (!existing.headline && rec.headline) existing.headline = rec.headline;
        if (existing.displayName === existing.username && rec.displayName !== rec.username) {
          existing.displayName = rec.displayName;
        }
      }
    }
  }

  async function scrape(onProgress) {
    const map = await window.SGE.scrollCollect({
      harvest,
      lastNode: () => {
        const c = cells();
        return c[c.length - 1] || null;
      },
      onProgress,
      delay: 900, // a touch slower — X rate-limits aggressive scrolling
    });
    return [...map.values()];
  }

  window.SGE.registerAdapter({
    network: "twitter",
    matches: (loc) => /(^|\.)(x|twitter)\.com$/.test(loc.hostname),
    ready: (loc) => /\/(following|followers|verified_followers)(\/|$)/.test(loc.pathname),
    notReadyMessage:
      "Open your Following or Followers page first (e.g. x.com/<you>/following).",
    scrape,
  });
})();
