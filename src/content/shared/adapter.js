// SiteAdapter registry + message dispatcher.
// Adapters register themselves here; this file owns the single SCRAPE message
// listener, adapter selection by URL, the PEOPLE_BATCH hand-off, and
// stale-context handling — so each adapter only has to know how to scrape.
//
// A SiteAdapter is a plain object:
//   {
//     network: "linkedin",
//     matches(location): boolean,        // is this the right site?
//     ready(location): boolean,          // (optional) on the right page?
//     notReadyMessage: string,           // (optional) shown when !ready
//     reportedCount(): number|null,      // (optional) site's own count
//     async scrape(onProgress): rawRecord[]
//   }

window.SGE = window.SGE || {};
window.SGE.adapters = window.SGE.adapters || [];

window.SGE.registerAdapter = function registerAdapter(adapter) {
  window.SGE.adapters.push(adapter);
  console.log(`[social-graph-extractor] registered adapter: ${adapter.network}`);
};

function pickAdapter() {
  return window.SGE.adapters.find((a) => {
    try {
      return a.matches(location);
    } catch {
      return false;
    }
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SCRAPE") return;

  const adapter = pickAdapter();
  if (!adapter) {
    sendResponse({ ok: false, error: "No scraper is registered for this site." });
    return true;
  }
  if (adapter.ready && !adapter.ready(location)) {
    sendResponse({
      ok: false,
      error: adapter.notReadyMessage || "Open the right page for this site first.",
    });
    return true;
  }

  adapter
    .scrape((n) =>
      console.log(`[social-graph-extractor] collected ${n} profiles…`)
    )
    .then(async (records) => {
      const reported = adapter.reportedCount ? adapter.reportedCount() : null;
      let resp;
      try {
        resp = await chrome.runtime.sendMessage({
          type: "PEOPLE_BATCH",
          network: adapter.network,
          records,
        });
      } catch (e) {
        // Extension reloaded while this tab kept the old content script.
        sendResponse({
          ok: false,
          error:
            "Extension context lost — close this tab and open the page in a fresh tab, then scrape again.",
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
