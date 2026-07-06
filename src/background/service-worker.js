// Service worker: message hub between content scripts and extension pages.
// Phase 0 is a stub that just proves the extension loads and messaging is wired.
// Storage writes, dedupe/merge, and export land in Phase 1+.

chrome.runtime.onInstalled.addListener(() => {
  console.log("[social-graph-extractor] installed");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log("[social-graph-extractor] message:", message);
  // Phase 1 will handle { type: "PEOPLE_BATCH" }, { type: "EXPORT" }, etc.
  sendResponse({ ok: true, phase: 0 });
  return true; // keep the channel open for async responses later
});
