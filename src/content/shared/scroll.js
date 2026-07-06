// Shared auto-scroll / "load more" helper for lazy-loaded lists.
// Classic content script — attaches to a shared window.SGE namespace
// (content scripts can't use ES module imports).

window.SGE = window.SGE || {};

/** Sleep helper. */
window.SGE.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Scroll to the bottom repeatedly until the page height stops growing,
 * clicking any "show more" style button in between. Handles both infinite
 * scroll and click-to-load pagination.
 *
 * @param {object} opts
 * @param {() => number} opts.countItems  returns current item count (used to detect growth)
 * @param {string[]} [opts.loadMoreSelectors]  buttons to click to load more
 * @param {number} [opts.stableRounds=3]  stop after this many rounds with no growth
 * @param {number} [opts.maxRounds=200]   hard safety cap
 * @param {number} [opts.delayMs=800]     wait between scrolls (gentle on rate limits)
 * @param {(n:number)=>void} [opts.onProgress]
 */
window.SGE.autoScroll = async function autoScroll(opts) {
  const {
    countItems,
    loadMoreSelectors = [],
    stableRounds = 3,
    maxRounds = 200,
    delayMs = 800,
    onProgress,
  } = opts;

  let stable = 0;
  let lastCount = countItems ? countItems() : 0;

  for (let round = 0; round < maxRounds; round++) {
    window.scrollTo(0, document.body.scrollHeight);
    await window.SGE.sleep(delayMs);

    // Click any visible "load more" button.
    for (const sel of loadMoreSelectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null && !btn.disabled) {
        btn.click();
        await window.SGE.sleep(delayMs);
      }
    }

    const count = countItems ? countItems() : 0;
    if (onProgress) onProgress(count);

    if (count <= lastCount) {
      stable++;
      if (stable >= stableRounds) break;
    } else {
      stable = 0;
      lastCount = count;
    }
  }

  return lastCount;
};
