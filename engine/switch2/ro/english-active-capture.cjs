'use strict';
// Historical HDMI helper deliberately disabled: a local capture path and
// scene witness must be supplied independently by the console operator.
async function main() {
  throw Error('No portable HDMI capture is installed; inspect the current console scene independently.');
}
module.exports = {main};
