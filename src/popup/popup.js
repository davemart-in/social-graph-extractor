// Popup controller (ES module). Reads stats from the service worker,
// triggers a scrape on the active tab, and exports the graph as JSON.

import { getPeople, buildExport } from "../lib/storage.js";

const $ = (id) => document.getElementById(id);
const statusEl = $("status");

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

async function refreshStats() {
  const stats = await chrome.runtime.sendMessage({ type: "GET_STATS" });
  if (!stats?.ok) return;
  $("total").textContent = stats.total;
  const parts = Object.entries(stats.byNetwork || {}).map(
    ([n, c]) => `${n}: ${c}`
  );
  $("by-network").textContent = parts.join(" · ");
}

$("open-graph").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/graph/graph.html") });
});

$("scrape").addEventListener("click", async () => {
  setStatus("Scraping… scroll happens automatically, keep this tab open.");
  $("scrape").disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const resp = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE" });
    if (!resp?.ok) {
      setStatus(resp?.error || "Scrape failed.", true);
      return;
    }
    const reported =
      resp.reported != null ? ` (page reports ${resp.reported})` : "";
    setStatus(
      `Scraped ${resp.scraped}${reported} — ${resp.added} new, ${resp.updated} updated.`
    );
    await refreshStats();
  } catch (err) {
    // Common cause: content script not injected (wrong site / needs reload).
    setStatus(
      "Could not reach the page. Open linkedin.com/mynetwork/invite-connect/connections/ and reload.",
      true
    );
  } finally {
    $("scrape").disabled = false;
  }
});

$("export").addEventListener("click", async () => {
  const people = await getPeople();
  if (!people.length) {
    setStatus("Nothing to export yet.", true);
    return;
  }
  const doc = buildExport(people);
  const blob = new Blob([JSON.stringify(doc, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({
    url,
    filename: "social-graph.json",
    saveAs: true,
  });
  // Revoke shortly after the download has been handed off.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  setStatus(`Exported ${people.length} people to social-graph.json.`);
});

refreshStats();
