// LinkedIn SiteAdapter. Scrapes the connections list at
//   https://www.linkedin.com/mynetwork/invite-connect/connections/
//
// LinkedIn ships randomized/obfuscated class names, so we key on stable
// structure: profile links (`a[href*="/in/"]`), the name/headline <p> text
// inside them, and the "Connected on <date>" line that marks a real
// 1st-degree connection. The list is virtualized, so we harvest incrementally
// via window.SGE.scrollCollect.
//
// Wrapped in an IIFE so its helpers don't collide with other adapters
// (all content scripts share one execution scope).

(function () {
  "use strict";

  const CONNECTIONS_PATH = "/mynetwork/invite-connect/connections";

  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  function normUrl(href) {
    try {
      const u = new URL(href, location.origin);
      return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
    } catch {
      return href.split(/[?#]/)[0].replace(/\/+$/, "");
    }
  }

  function profileAnchors() {
    return [...document.querySelectorAll('a[href*="/in/"]')].filter((a) => {
      try {
        return /\/in\/[^/]/.test(new URL(a.href, location.origin).pathname);
      } catch {
        return false;
      }
    });
  }

  function extractUsername(url) {
    const m = url.match(/\/in\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // Walk up to the nearest "Connected on <date>" without crossing into a
  // neighbouring card (stop once an ancestor spans >1 distinct profile).
  function findConnectedDate(anchor) {
    let el = anchor;
    for (let i = 0; i < 8 && el.parentElement; i++) {
      el = el.parentElement;
      const urls = new Set(
        [...el.querySelectorAll('a[href*="/in/"]')].map((a) => normUrl(a.href))
      );
      if (urls.size > 1) break;
      const p = [...el.querySelectorAll("p")].find((p) =>
        /^connected on/i.test(clean(p.textContent))
      );
      if (p) return clean(p.textContent).replace(/^connected on\s*/i, "");
    }
    return null;
  }

  // Merge each person's photo + text anchors (same href) into `byUrl`.
  function harvest(byUrl) {
    for (const a of profileAnchors()) {
      const url = normUrl(a.href);
      const entry =
        byUrl.get(url) ||
        { profileUrl: a.href, name: null, altName: null, headline: null, connectedOn: null };

      const ps = [...a.querySelectorAll("p")]
        .map((p) => clean(p.textContent))
        .filter(Boolean);
      if (ps.length) {
        if (!entry.name) entry.name = ps[0];
        if (!entry.headline && ps[1]) entry.headline = ps[1];
      }

      if (!entry.altName) {
        const img = a.querySelector("img[alt]");
        const m =
          img && img.getAttribute("alt").match(/^(.*?)['’]s profile picture$/i);
        if (m) entry.altName = clean(m[1]);
      }

      if (!entry.connectedOn) {
        const d = findConnectedDate(a);
        if (d) entry.connectedOn = d;
      }

      byUrl.set(url, entry);
    }
  }

  function buildRecords(byUrl) {
    // Prefer rows with a "Connected on" date (real 1st-degree connections);
    // fall back to all named rows if that signal ever disappears.
    const named = [...byUrl.values()].filter((e) => e.name || e.altName);
    const withDate = named.filter((e) => e.connectedOn);
    const chosen = withDate.length ? withDate : named;

    return chosen.map((e) => ({
      network: "linkedin",
      profileUrl: e.profileUrl,
      username: extractUsername(e.profileUrl),
      displayName: e.name || e.altName,
      headline: e.headline || null,
      company: null, // not on the list; would need a profile visit
      location: null,
      connectionType: "1st",
      connectedOn: e.connectedOn || null,
    }));
  }

  function clickLoadMore() {
    for (const sel of [
      "button.scaffold-finite-scroll__load-button",
      "button[aria-label*='more results' i]",
    ]) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null && !btn.disabled) btn.click();
    }
  }

  async function scrape(onProgress) {
    const map = await window.SGE.scrollCollect({
      harvest,
      lastNode: () => {
        const a = profileAnchors();
        return a[a.length - 1] || null;
      },
      clickLoadMore,
      onProgress,
    });
    return buildRecords(map);
  }

  function reportedCount() {
    const m = (document.body.innerText || "").match(/([\d,]+)\s+Connections?\b/i);
    return m ? Number(m[1].replace(/,/g, "")) : null;
  }

  window.SGE.registerAdapter({
    network: "linkedin",
    matches: (loc) => /(^|\.)linkedin\.com$/.test(loc.hostname),
    ready: (loc) => loc.pathname.startsWith(CONNECTIONS_PATH),
    notReadyMessage:
      "Open your Connections page first: linkedin.com/mynetwork/invite-connect/connections/",
    reportedCount,
    scrape,
  });
})();
