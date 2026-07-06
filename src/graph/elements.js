// Pure graph-building helpers — no DOM, no chrome, no cytoscape instance.
// Kept separate from graph.js so this logic is unit-testable in Node.

export const NETS = [
  { key: "linkedin", label: "LinkedIn", color: "#0a66c2" },
  { key: "twitter", label: "Twitter/X", color: "#1d9bf0" },
  { key: "facebook", label: "Facebook", color: "#1877f2" },
];

export const COLOR = Object.fromEntries(NETS.map((n) => [n.key, n.color]));

/** Earliest connection year across a person's identities, or null if none
 *  of their networks recorded a date. "First time we connected anywhere." */
export function personYear(p) {
  const years = (p.identities || [])
    .map((i) => {
      const m = i.connectedOn && i.connectedOn.match(/\b(?:19|20)\d{2}\b/);
      return m ? Number(m[0]) : null;
    })
    .filter((y) => y != null);
  return years.length ? Math.min(...years) : null;
}

function personNodeData(p) {
  const share = 100 / p.networks.length;
  return {
    id: p.id,
    label: p.displayName,
    networks: p.networks.join(","),
    multi: p.networks.length > 1 ? 1 : 0,
    piLi: p.networks.includes("linkedin") ? share : 0,
    piTw: p.networks.includes("twitter") ? share : 0,
    piFb: p.networks.includes("facebook") ? share : 0,
  };
}

/** Group people by connection year, sorted ascending with "Unknown" last.
 *  → [{ label, people: [...] }] */
export function groupByYear(people) {
  const byYear = new Map();
  for (const p of people) {
    const y = personYear(p);
    const label = y ? String(y) : "Unknown";
    if (!byYear.has(label)) byYear.set(label, []);
    byYear.get(label).push(p);
  }
  return [...byYear.keys()]
    .sort((a, b) => (a === "Unknown" ? 1 : b === "Unknown" ? -1 : Number(a) - Number(b)))
    .map((label) => ({ label, people: byYear.get(label) }));
}

/**
 * Build Cytoscape elements.
 *   mode "year" (default): You → Year hub → Person.
 *   mode "ring":           You → Person (flat).
 */
export function buildElements(people, mode = "year") {
  const els = [{ data: { id: "me", label: "You", me: 1 } }];

  const addPerson = (p, parentId) => {
    els.push({ data: personNodeData(p) });
    els.push({ data: { id: `e_${p.id}`, source: parentId, target: p.id } });
  };

  if (mode === "ring") {
    for (const p of people) addPerson(p, "me");
    return els;
  }

  for (const { label, people: group } of groupByYear(people)) {
    const yid = `year_${label}`;
    els.push({ data: { id: yid, label, isYear: 1, count: group.length } });
    els.push({ data: { id: `e_${yid}`, source: "me", target: yid } });
    for (const p of group) addPerson(p, yid);
  }
  return els;
}

/** Should a person node (given its comma-joined networks) be visible? */
export function isVisible(networksCsv, enabledSet) {
  return (networksCsv || "").split(",").some((n) => enabledSet.has(n));
}

/** Concentric ring offsets for k nodes around a hub. Each ring's capacity
 *  grows with its circumference (the 4→8→16 staggering), and successive rings
 *  are rotated so nodes don't line up radially. */
function clusterOffsets(k, { nodeSpacing, ringGap, baseR }) {
  const offsets = [];
  let placed = 0;
  let ring = 0;
  let lastRadius = baseR;
  while (placed < k) {
    const radius = baseR + ring * ringGap;
    lastRadius = radius;
    const cap = Math.max(1, Math.floor((2 * Math.PI * radius) / nodeSpacing));
    const n = Math.min(cap, k - placed);
    for (let j = 0; j < n; j++) {
      const a = (2 * Math.PI * j) / n + ring * 0.4;
      offsets.push({ dx: radius * Math.cos(a), dy: radius * Math.sin(a) });
    }
    placed += n;
    ring++;
  }
  return { offsets, outerRadius: (k ? lastRadius : 0) + nodeSpacing / 2 };
}

/**
 * Radial layout positions: "me" at the center, year hubs equally spaced on a
 * ring around it, and each year's people in concentric sub-rings around their
 * hub. The year-ring radius is sized so the biggest cluster clears both its
 * neighbours and "me". Returns a Map of node id → {x, y}.
 *
 * @param groups  output of groupByYear (only the years/people to place)
 */
export function computeRadialPositions(groups, opts = {}) {
  // meClearance leaves room at the center for an enlarged, readable "You" node.
  const { nodeSpacing = 46, ringGap = 48, baseR = 64, meClearance = 220 } = opts;
  const pos = new Map([["me", { x: 0, y: 0 }]]);
  const numYears = groups.length;
  if (numYears === 0) return pos;

  const clusters = groups.map((g) =>
    clusterOffsets(g.people.length, { nodeSpacing, ringGap, baseR })
  );
  const maxOuter = Math.max(baseR, ...clusters.map((c) => c.outerRadius));

  // Keep clusters from overlapping each other or "me".
  let R = maxOuter + meClearance;
  if (numYears > 1) {
    R = Math.max(R, (maxOuter + 24) / Math.sin(Math.PI / numYears));
  }

  groups.forEach((g, i) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / numYears; // first year at top
    const cx = R * Math.cos(ang);
    const cyy = R * Math.sin(ang);
    pos.set(`year_${g.label}`, { x: cx, y: cyy });
    g.people.forEach((p, j) => {
      const o = clusters[i].offsets[j];
      pos.set(p.id, { x: cx + o.dx, y: cyy + o.dy });
    });
  });
  return pos;
}

export const STYLE = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "font-size": 11,
      color: "#334155",
      width: 34,
      height: 34,
      "text-valign": "bottom",
      "text-margin-y": 4,
      "text-max-width": "120px",
      "text-wrap": "ellipsis",
      "min-zoomed-font-size": 5,
      "background-color": "#cbd5e1",
    },
  },
  {
    // Pie colouring only for person nodes — the [piLi] guard keeps the
    // data-mapped pie sizes off hubs/"me" (which have no piLi/piTw/piFb).
    selector: "node[piLi]",
    style: {
      "pie-size": "100%",
      "pie-1-background-color": COLOR.linkedin,
      "pie-1-background-size": "data(piLi)",
      "pie-2-background-color": COLOR.twitter,
      "pie-2-background-size": "data(piTw)",
      "pie-3-background-color": COLOR.facebook,
      "pie-3-background-size": "data(piFb)",
    },
  },
  {
    selector: "node[multi = 1]",
    style: { "border-width": 3, "border-color": "#7c3aed" },
  },
  {
    selector: "node[?isYear]",
    style: {
      "background-color": "#f1f5f9",
      "border-width": 1,
      "border-color": "#94a3b8",
      shape: "round-rectangle",
      width: 74, // fixed size that fits the longest label ("Unknown")
      height: 30,
      color: "#0f172a",
      "font-size": 13,
      "font-weight": "bold",
      "text-valign": "center",
      "text-halign": "center",
      "text-margin-y": 0,
      "text-wrap": "none",
      "min-zoomed-font-size": 0,
      "pie-size": "0%",
    },
  },
  {
    selector: "#me",
    style: {
      "background-color": "#111827",
      "pie-size": "0%",
      shape: "round-rectangle",
      width: 56, // starting size; sizeMeForZoom() rescales to stay readable
      height: 56,
      color: "#fff",
      "font-size": 18,
      "font-weight": "bold",
      "text-valign": "center",
      "text-halign": "center",
      "text-margin-y": 0,
      "text-wrap": "none", // don't ellipsize the label into "..."
      "text-max-width": "1000px",
      "min-zoomed-font-size": 0, // never hide the "You" label
    },
  },
  { selector: "edge", style: { "line-color": "#cbd5e1", width: 1, "curve-style": "bezier" } },
  // You → year spokes: the main structure, drawn darker/heavier.
  { selector: 'edge[source = "me"]', style: { "line-color": "#64748b" } },
  { selector: "node:selected", style: { "border-width": 3, "border-color": "#111827" } },
];
