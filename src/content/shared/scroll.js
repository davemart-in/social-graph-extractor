// Shared scroll-and-collect helper for virtualized / lazy-loaded lists.
// Classic content script — attaches to a shared window.SGE namespace
// (content scripts can't use ES module imports).

window.SGE = window.SGE || {};

window.SGE.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Drive a virtualized or infinite-scroll list to completion, harvesting rows
 * on every step so they're captured before the list unmounts them.
 *
 * @param {object} opts
 * @param {(map: Map) => void} opts.harvest  extract current DOM rows into `map`
 * @param {() => (Element|null)} [opts.lastNode]  node to scrollIntoView to load more
 * @param {() => void} [opts.clickLoadMore]  click any "show more" button
 * @param {(size:number)=>void} [opts.onProgress]
 * @param {number} [opts.stableRounds=5]  stop after this many rounds with no growth
 * @param {number} [opts.maxRounds=600]   hard safety cap
 * @param {number} [opts.delay=650]       wait between steps (gentle on rate limits)
 * @returns {Promise<Map>} the accumulated map the caller's `harvest` filled
 */
window.SGE.scrollCollect = async function scrollCollect({
  harvest,
  lastNode,
  clickLoadMore,
  onProgress,
  stableRounds = 5,
  maxRounds = 600,
  delay = 650,
}) {
  const map = new Map();
  let stable = 0;

  for (let round = 0; round < maxRounds; round++) {
    harvest(map);
    const before = map.size;

    const node = lastNode ? lastNode() : null;
    if (node) node.scrollIntoView({ block: "end", behavior: "auto" });
    window.scrollBy(0, 1000);
    if (clickLoadMore) clickLoadMore();

    await window.SGE.sleep(delay);
    harvest(map);
    if (onProgress) onProgress(map.size);

    if (map.size <= before) {
      if (++stable >= stableRounds) break;
    } else {
      stable = 0;
    }
  }

  harvest(map); // final sweep
  return map;
};
