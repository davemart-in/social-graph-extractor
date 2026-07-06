// LinkedIn content script.
// Phase 0 stub: confirms the content script injects on linkedin.com.
// Phase 1 implements the connections-list scrape behind the SiteAdapter interface.

console.log("[social-graph-extractor] LinkedIn content script loaded");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SCRAPE") {
    // Phase 1: walk the connections list, extract Person[], post back.
    sendResponse({ ok: true, phase: 0, people: [] });
  }
  return true;
});
