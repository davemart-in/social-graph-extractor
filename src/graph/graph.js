// Graph viewer.
// Phase 0: initialize an empty Cytoscape canvas and confirm the bundled lib loads.
// Phase 3 loads people from storage, builds nodes/edges, and wires the toggles.

const cy = cytoscape({
  container: document.getElementById("cy"),
  elements: [],
  style: [
    {
      selector: "node",
      style: {
        "background-color": "#0a66c2",
        label: "data(label)",
        "font-size": "10px",
        color: "#333",
      },
    },
    {
      selector: "edge",
      style: { "line-color": "#cbd5e1", width: 1 },
    },
  ],
  layout: { name: "grid" },
});

// Phase 3: on checkbox change, filter cy.nodes() by data('networks').
document.querySelectorAll("#toggles input").forEach((cb) => {
  cb.addEventListener("change", () => {
    console.log("[social-graph-extractor] toggle", cb.value, cb.checked);
  });
});

console.log("[social-graph-extractor] graph ready (empty until Phase 3)");
