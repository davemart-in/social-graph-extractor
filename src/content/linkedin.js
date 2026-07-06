// LinkedIn adapter (Phase 1). Classic content script.
// Scrapes the connections list at:
//   https://www.linkedin.com/mynetwork/invite-connect/connections/
//
// LinkedIn's current UI uses randomized/obfuscated class names, so we key on
// stable structure instead: profile links (`a[href*="/in/"]`), the name +
// headline `<p>` text inside the profile link, and the "Connected on <date>"
// line that marks a real 1st-degree connection.

window.SGE = window.SGE || {};

const CONNECTIONS_PATH = "/mynetwork/invite-connect/connections";

function clean(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

/** Normalize a profile href to path-only, no query/fragment/trailing slash. */
function normUrl(href) {
  try {
    const u = new URL(href, location.origin);
    return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    return href.split(/[?#]/)[0].replace(/\/+$/, "");
  }
}

/** All anchors pointing at a member profile (/in/<slug>). */
function profileAnchors() {
  return [...document.querySelectorAll('a[href*="/in/"]')].filter((a) => {
    try {
      return /\/in\/[^/]/.test(new URL(a.href, location.origin).pathname);
    } catch {
      return false;
    }
  });
}

/** Pull the vanity slug from a /in/<slug>/ URL. */
function extractUsername(url) {
  const m = url.match(/\/in\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Walk up from an anchor to find the nearest "Connected on <date>" line,
 *  without crossing into a neighbouring card: as soon as an ancestor spans
 *  more than one distinct profile, we've gone too far up and stop. */
function findConnectedDate(anchor) {
  let el = anchor;
  for (let i = 0; i < 8 && el.parentElement; i++) {
    el = el.parentElement;
    const urls = new Set(
      [...el.querySelectorAll('a[href*="/in/"]')].map((a) => normUrl(a.href))
    );
    if (urls.size > 1) break; // left this person's card
    const p = [...el.querySelectorAll("p")].find((p) =>
      /^connected on/i.test(clean(p.textContent))
    );
    if (p) return clean(p.textContent).replace(/^connected on\s*/i, "");
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Harvest the profiles currently in the DOM into `byUrl`, merging each
 * person's photo + text anchors (same href). Called repeatedly during
 * scrolling so rows are captured before a virtualized list unmounts them.
 */
function harvest(byUrl) {
  for (const a of profileAnchors()) {
    const url = normUrl(a.href);
    const entry =
      byUrl.get(url) ||
      { profileUrl: a.href, name: null, altName: null, headline: null, connectedOn: null };

    // Name + headline: the text anchor holds them as <p> lines.
    const ps = [...a.querySelectorAll("p")]
      .map((p) => clean(p.textContent))
      .filter(Boolean);
    if (ps.length) {
      if (!entry.name) entry.name = ps[0];
      if (!entry.headline && ps[1]) entry.headline = ps[1];
    }

    // Fallback name: the profile-photo img alt is "<Name>'s profile picture".
    if (!entry.altName) {
      const img = a.querySelector("img[alt]");
      const m = img && img.getAttribute("alt").match(/^(.*?)['’]s profile picture$/i);
      if (m) entry.altName = clean(m[1]);
    }

    if (!entry.connectedOn) {
      const d = findConnectedDate(a);
      if (d) entry.connectedOn = d;
    }

    byUrl.set(url, entry);
  }
}

/** Turn the accumulated map into records, keeping only real connections. */
function buildRecords(byUrl) {
  // Prefer rows that carry a "Connected on" date — that marks a real
  // 1st-degree connection and excludes your own nav link / stray /in/ links.
  // Safety net: if NO row has a date (wording changed), keep all named rows
  // so we degrade gracefully instead of returning nothing.
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

/**
 * Scroll-and-collect loop. Harvests on every step, then advances by pulling
 * the last profile card into view — which works whether the page scrolls the
 * window or an inner overflow container. Stops when no new profiles appear
 * for several consecutive rounds.
 */
async function scrapeConnections(onProgress) {
  const byUrl = new Map();
  let stable = 0;
  const STABLE_ROUNDS = 5;
  const MAX_ROUNDS = 600;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    harvest(byUrl);
    const before = byUrl.size;

    const anchors = profileAnchors();
    const last = anchors[anchors.length - 1];
    if (last) last.scrollIntoView({ block: "end", behavior: "auto" });
    window.scrollBy(0, 1000);
    clickLoadMore();

    await sleep(650);
    harvest(byUrl);
    if (onProgress) onProgress(byUrl.size);

    if (byUrl.size <= before) {
      if (++stable >= STABLE_ROUNDS) break;
    } else {
      stable = 0;
    }
  }

  harvest(byUrl);
  return buildRecords(byUrl);
}

/** Best-effort "X connections" count for the checkpoint comparison. */
function readReportedCount() {
  const m = (document.body.innerText || "").match(
    /([\d,]+)\s+Connections?\b/i
  );
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

console.log("[social-graph-extractor] LinkedIn adapter ready");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SCRAPE") return;

  if (!location.pathname.startsWith(CONNECTIONS_PATH)) {
    sendResponse({
      ok: false,
      error:
        "Open your Connections page first: linkedin.com/mynetwork/invite-connect/connections/",
    });
    return true;
  }

  scrapeConnections((n) =>
    console.log(`[social-graph-extractor] collected ${n} profiles…`)
  )
    .then(async (records) => {
      const reported = readReportedCount();
      let resp;
      try {
        resp = await chrome.runtime.sendMessage({
          type: "PEOPLE_BATCH",
          network: "linkedin",
          records,
        });
      } catch (e) {
        // Extension was reloaded while this tab kept the old content script.
        sendResponse({
          ok: false,
          error:
            "Extension context lost — close this tab and open your Connections page in a fresh tab, then scrape again.",
        });
        return;
      }
      sendResponse({
        ok: true,
        scraped: records.length,
        reported,
        added: resp?.added ?? 0,
        updated: resp?.updated ?? 0,
        total: resp?.total ?? 0,
      });
    })
    .catch((err) => {
      console.error("[social-graph-extractor] scrape failed", err);
      sendResponse({ ok: false, error: String(err?.message || err) });
    });

  return true; // async response
});
