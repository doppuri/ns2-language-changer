'use strict';
// Receipt plumbing bound to an ns2jb run folder. Receipts live beside the
// pipeline's own reports in <run>/switch2/ro/ and carry a '-settings-' infix
// so they never collide with ns2jb's or the trial's stage files.
const fs = require('node:fs/promises'), path = require('node:path');
const check = (ok, why) => { if (!ok) throw Error(why); };

function create(runDirectory) {
  const directory = path.join(runDirectory, 'switch2', 'ro');
  return {
    directory,
    read: file => fs.readFile(file, 'utf8').then(JSON.parse),
    save: async (file, value) => {
      const temporary = file + '.' + process.pid + '.tmp';
      await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
      await fs.rename(temporary, file);
    },
    local: (session, suffix) => path.join(directory, session + suffix),
  };
}

module.exports = { create, check };
