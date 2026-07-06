// Service worker: message hub + storage writes.
// Runs as an ES module (see manifest "type": "module"), so it can import
// the shared model/storage layer.

import { getPeople, upsertRecords } from "../lib/storage.js";

chrome.runtime.onInstalled.addListener(() => {
  console.log("[social-graph-extractor] installed");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case "PEOPLE_BATCH": {
          const scrapedAt = new Date().toISOString();
          const result = await upsertRecords(
            message.network,
            message.records || [],
            scrapedAt
          );
          console.log("[social-graph-extractor] batch upserted", result);
          sendResponse({ ok: true, ...result });
          break;
        }
        case "GET_STATS": {
          const people = await getPeople();
          const byNetwork = {};
          for (const p of people) {
            for (const n of p.networks) byNetwork[n] = (byNetwork[n] || 0) + 1;
          }
          sendResponse({ ok: true, total: people.length, byNetwork });
          break;
        }
        default:
          sendResponse({ ok: false, error: `unknown message ${message?.type}` });
      }
    } catch (err) {
      console.error("[social-graph-extractor] sw error", err);
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();

  return true; // async response
});
