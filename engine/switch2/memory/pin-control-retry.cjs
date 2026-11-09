// An abort-control intentionally never performs the overwrite. A short
// canary on its first pin allocation is a retryable timing miss, not a reason
// to spend the entire console boot. Never waive containment on a real wave.
const pinContained = row => {
  const canary = row.rows.find(item => item.role === 'canary');
  const pin = row.rows.find(item => item.role === 'pin');
  return Boolean(canary && pin && canary.startUs < pin.startUs && pin.endUs < canary.endUs);
};

const ownedReleaseBytes = (beforeRelease, afterRelease) => {
  if (!Number.isSafeInteger(beforeRelease) || !Number.isSafeInteger(afterRelease) ||
      afterRelease < beforeRelease) throw Error('Invalid allocation counter around owned pin release');
  return afterRelease - beforeRelease;
};

const retryableControl = row => row.profile === 'abort-control' && !pinContained(row) &&
  row.triggerAborted && row.nativeGuard?.completed === 1 && row.restored === true &&
  row.newPersistentBytes === 13616 && row.changedPaths.length === 0 &&
  row.canaryResult === 0 && row.canaryType === 1;

async function runPinControl(wave, releaseOwnedPin, attempts = 4) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 4) throw Error('Invalid pin-control retry budget');
  let row;
  for (let attempt = 0; attempt < attempts; attempt++) {
    row = await wave('abort-control');
    if (pinContained(row)) return row;
    if (!retryableControl(row)) throw Error('Pinning control changed state; no internal retry');
    // The current pin allocation belongs to this trial and has been checked
    // against its exact measured 13,616-byte cost. At an epoch renewal, all
    // earlier positive waves must have restored, unchanged canary/path state.
    await releaseOwnedPin(row, attempt + 1);
  }
  throw Error('Pinning control missed its measured window in four owned attempts');
}

module.exports = {pinContained, ownedReleaseBytes, retryableControl, runPinControl};
