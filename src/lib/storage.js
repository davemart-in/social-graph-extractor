// Storage layer over chrome.storage.local. Imported by the service worker
// and the popup (both real extension contexts).

import {
  makeIdentity,
  makePerson,
  identityKey,
  recomputeNetworks,
} from "./model.js";

const KEY = "people";

/** Read the full people array (empty if nothing stored yet). */
export async function getPeople() {
  const out = await chrome.storage.local.get(KEY);
  return Array.isArray(out[KEY]) ? out[KEY] : [];
}

export async function savePeople(people) {
  await chrome.storage.local.set({ [KEY]: people });
}

export async function clearPeople() {
  await chrome.storage.local.remove(KEY);
}

/**
 * Upsert a batch of raw scraped records for one network.
 * Dedupes WITHIN a network by normalized profile URL: a repeat scrape
 * updates the existing identity's fields rather than adding a duplicate.
 * Cross-network merging is a separate, user-confirmed step (Phase 6).
 *
 * Returns { added, updated, total }.
 */
export async function upsertRecords(network, records, scrapedAt) {
  const people = await getPeople();

  // Index existing identities by their within-network key for O(1) lookup.
  const byIdentityKey = new Map();
  for (const person of people) {
    for (const identity of person.identities) {
      byIdentityKey.set(identityKey(identity), person);
    }
  }

  let added = 0;
  let updated = 0;

  for (const raw of records) {
    const identity = makeIdentity({ ...raw, network }, scrapedAt);
    if (!identity.profileUrl || !identity.displayName) continue; // skip junk rows

    const key = identityKey(identity);
    const existing = byIdentityKey.get(key);

    if (existing) {
      // Update the matching identity in place, preserving other networks.
      const idx = existing.identities.findIndex(
        (i) => identityKey(i) === key
      );
      existing.identities[idx] = identity;
      recomputeNetworks(existing);
      updated++;
    } else {
      const person = makePerson(identity);
      people.push(person);
      byIdentityKey.set(key, person);
      added++;
    }
  }

  await savePeople(people);
  return { added, updated, total: people.length };
}

/** Build the exportable graph document. */
export function buildExport(people) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    people,
  };
}
