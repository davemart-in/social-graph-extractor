// Pure data-model helpers. NO chrome APIs here so this module stays
// importable by node --test (see Phase 6 verification).

export const NETWORKS = ["linkedin", "twitter", "facebook"];

/** Deterministic small hash (djb2) → base36. Stable across sessions. */
export function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/** Strip query string, fragment, and trailing slash so the same profile
 *  URL always normalizes identically (used as the within-network key). */
export function normalizeProfileUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url, "https://www.linkedin.com");
    return `${u.origin}${u.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return String(url).split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();
  }
}

/** Collapse whitespace and trim. */
export function cleanText(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

/** Build a normalized identity from a raw scraped record. */
export function makeIdentity(raw, scrapedAt) {
  return {
    network: raw.network,
    profileUrl: normalizeProfileUrl(raw.profileUrl),
    username: raw.username ? cleanText(raw.username) : null,
    displayName: cleanText(raw.displayName),
    headline: raw.headline ? cleanText(raw.headline) : null,
    company: raw.company ? cleanText(raw.company) : null,
    location: raw.location ? cleanText(raw.location) : null,
    connectionType: raw.connectionType ? cleanText(raw.connectionType) : null,
    connectedOn: raw.connectedOn ? cleanText(raw.connectedOn) : null,
    scrapedAt: scrapedAt || raw.scrapedAt || null,
  };
}

/** Stable within-network key: network + normalized profile URL. */
export function identityKey(identity) {
  return `${identity.network}::${normalizeProfileUrl(identity.profileUrl)}`;
}

/** A Person id derived from its first identity's key, so re-scraping the
 *  same profile lands on the same node. */
export function personIdFor(identity) {
  return "p_" + hashString(identityKey(identity));
}

/** Wrap a single identity into a fresh Person node. */
export function makePerson(identity) {
  return {
    id: personIdFor(identity),
    displayName: identity.displayName,
    emails: [],
    identities: [identity],
    networks: [identity.network],
    mergedFrom: [],
  };
}

/** Recompute the derived `networks` list from identities. */
export function recomputeNetworks(person) {
  person.networks = [...new Set(person.identities.map((i) => i.network))];
  return person;
}
