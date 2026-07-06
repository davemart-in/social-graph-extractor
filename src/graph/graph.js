// Graph viewer (ES module). Loads people from storage and renders either a
// You → Year → Person tree (default) or a flat You → Person ring.
// Uses the globally-loaded `cytoscape` (from vendor/, via a classic <script>).

import { getPeople, buildExport } from "../lib/storage.js";
import {
  NETS,
  COLOR,
  buildElements,
  isVisible,
  groupByYear,
  computeRadialPositions,
  STYLE,
} from "./elements.js";

let cy;
let byId = new Map();
let people = [];

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function enabledNetworks() {
  return new Set(
    [...document.querySelectorAll("#toggles input:checked")].map((cb) => cb.value)
  );
}

function visiblePeople() {
  const enabled = enabledNetworks();
  return people.filter((p) => isVisible(p.networks.join(","), enabled));
}

function capZoom() {
  // Don't let `fit` zoom in past 1× on a small graph (nodes would balloon).
  if (cy.zoom() > 1) {
    cy.zoom({ level: 1, position: cy.getElementById("me").position() });
    cy.center(cy.getElementById("me"));
  }
}

/** Scale zoom-sensitive elements so they render at a readable pixel size no
 *  matter how far `fit` zoomed out: the "You" node (~70px, clamped to the 220
 *  center clearance so it can't overlap the inner clusters) and edge widths
 *  (~2px people, ~3.5px You→year spokes). */
function scaleForZoom() {
  const z = cy.zoom() || 1;
  const size = Math.max(56, Math.min(360, Math.round(70 / z)));
  const edgeW = Math.max(1, Math.min(40, 2 / z));
  cy.batch(() => {
    cy.getElementById("me").style({
      width: size,
      height: size,
      "font-size": Math.round(size * 0.28),
    });
    cy.edges().style("width", edgeW);
    cy.edges('[source = "me"]').style("width", Math.min(40, edgeW * 1.25));
  });
}

/** Fit the visible graph, cap zoom, and keep key elements readable. */
function fitView() {
  cy.fit(cy.$(":visible"), 50);
  capZoom();
  scaleForZoom();
}

/** Radial year layout: me center, year hubs on a ring, people in sub-rings.
 *  Recomputed against only the visible people so rings re-pack on filtering. */
function layoutRadial(fit = true) {
  const groups = groupByYear(visiblePeople());
  const pos = computeRadialPositions(groups);
  cy.batch(() => {
    cy.nodes().forEach((n) => {
      const p = pos.get(n.id());
      if (p) {
        n.style("display", "element");
        n.position(p);
      } else {
        n.style("display", "none");
      }
    });
  });
  if (fit) fitView();
}

function relayout(fit = true) {
  layoutRadial(fit);
}

/** Download the full graph as JSON (same output as the popup's export). */
async function exportJson() {
  if (!people.length) return;
  const blob = new Blob([JSON.stringify(buildExport(people), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({ url, filename: "social-graph.json", saveAs: true });
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function updateCounts() {
  for (const { key } of NETS) {
    const c = people.filter((p) => p.networks.includes(key)).length;
    const el = document.querySelector(`[data-count="${key}"]`);
    if (el) el.textContent = c;
  }
}

function resetDetails() {
  $("#details").textContent = "Select a node to see details.";
}

function showDetails(node) {
  const details = $("#details");
  if (node.data("me")) {
    details.innerHTML = `<h2>You</h2><p class="muted">${byId.size} connections</p>`;
    return;
  }
  if (node.data("isYear")) {
    details.innerHTML = `<h2>${esc(node.data("label"))}</h2>
      <p class="muted">${node.data("count")} connection(s) first made this year</p>`;
    return;
  }
  const p = byId.get(node.id());
  if (!p) return;

  const identities = p.identities
    .map(
      (i) => `
      <div class="identity">
        <div class="net" style="color:${COLOR[i.network] || "#334155"}">${esc(i.network)}</div>
        <div class="idname">${esc(i.displayName)}</div>
        ${i.headline ? `<div class="muted">${esc(i.headline)}</div>` : ""}
        ${i.company ? `<div class="muted">${esc(i.company)}</div>` : ""}
        ${i.location ? `<div class="muted">${esc(i.location)}</div>` : ""}
        ${i.connectedOn ? `<div class="muted">Connected: ${esc(i.connectedOn)}</div>` : ""}
        <a href="${esc(i.profileUrl)}" target="_blank" rel="noopener noreferrer">${esc(i.profileUrl)}</a>
      </div>`
    )
    .join("");

  details.innerHTML = `
    <h2>${esc(p.displayName)}</h2>
    ${p.emails?.length ? `<div class="muted">${p.emails.map(esc).join(", ")}</div>` : ""}
    ${identities}`;
}

/** (Re)build all elements and lay them out. */
function render() {
  cy.elements().remove();
  cy.add(buildElements(people));
  relayout(true);
}

async function init() {
  people = await getPeople();
  byId = new Map(people.map((p) => [p.id, p]));

  $("#empty").hidden = people.length > 0;
  updateCounts();

  cy = cytoscape({
    container: $("#cy"),
    elements: [],
    style: STYLE,
    minZoom: 0.05,
    maxZoom: 2.5,
    // zooming/panning are enabled by default (wheel to zoom, drag to pan)
  });

  cy.on("tap", "node", (evt) => showDetails(evt.target));
  cy.on("tap", (evt) => {
    if (evt.target === cy) resetDetails();
  });

  document.querySelectorAll("#toggles input").forEach((cb) => {
    cb.addEventListener("change", () => relayout(true));
  });
  $("#relayout").addEventListener("click", () => relayout(true));
  $("#export").addEventListener("click", exportJson);

  render();
}

init();
