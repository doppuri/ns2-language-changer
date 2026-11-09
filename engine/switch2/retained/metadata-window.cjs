'use strict';

// One-factor trial: probe only the page containing the observed external link.
// Previously first-page links used 16 KiB; the anchor itself fits in 4 KiB.
// Forced 16 KiB remains available for an offline comparison, never as fallback.
function metadataWindow(next, override = process.env.NS2_METADATA_PROBE_4K) {
  if (!Number.isSafeInteger(next) || next < 2 ** 32 || next >= 2 ** 39)
    throw Error('Expected a canonical external allocator link');
  if (override !== undefined && override !== '0' && override !== '1')
    throw Error('NS2_METADATA_PROBE_4K must be 0 or 1');
  const originalBlockOffset = next % 0x4000;
  const narrow = override !== '0';
  const length = narrow ? 0x1000 : 0x4000;
  const address = Math.floor(next / length) * length;
  return {address, length, anchorOffset: next - address, originalBlockOffset,
    selection: override === undefined ? 'observed-link' : override === '1' ? 'forced-4k' : 'forced-16k'};
}

module.exports = {metadataWindow};
