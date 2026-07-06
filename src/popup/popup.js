// Popup controller.
// Phase 0: only "Open graph" is wired. Scrape/export activate in Phase 1
// once storage and the LinkedIn adapter exist.

document.getElementById("open-graph").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/graph/graph.html") });
});

// Placeholder count read — storage is empty until Phase 1.
document.getElementById("total").textContent = "0";
