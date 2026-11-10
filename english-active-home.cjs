'use strict';
// Fail-closed placeholder for the English stage's unused capture default:
// no portable HOME observation route exists; an independent, current-scene
// capture remains the only UI evidence path.
async function main() {
  throw Error('No portable HOME observation route is installed; use a fresh, scene-gated independent capture.');
}
module.exports = { main };
