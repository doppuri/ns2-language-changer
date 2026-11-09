const http = require('node:http');
const path = require('node:path');
const {port, token, addresses} = require('../connection.json');

function remainingDeadlineMs(deadlineNs) {
  if (typeof deadlineNs !== 'bigint') throw Error('Invalid bounded native deadline');
  const ns = deadlineNs - process.hrtime.bigint();
  if (ns <= 0n || ns > 3000000000n) throw Error('Expired or oversized bounded native deadline');
  return Math.max(1, Math.ceil(Number(ns)/1000000));
}
function request(body, deadlineNs = null) {
  const remainingMs = deadlineNs === null ? null : remainingDeadlineMs(deadlineNs);
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (error) reject(error); else resolve(result);
    };
    const req = http.request({host: '127.0.0.1', port, path: '/', method: 'POST',
      headers: {authorization: 'Bearer ' + token, 'content-type': 'application/json'}}, res => {
      const parts = [];
      res.on('data', part => parts.push(part));
      res.on('error', error => finish(error));
      res.on('end', () => {
        try {
          const value = JSON.parse(Buffer.concat(parts));
          if (res.statusCode !== 200) throw Error(value.error || 'Native bridge failed');
          finish(null, value);
        } catch (error) {finish(error);}
      });
    });
    req.setTimeout(180000, () => req.destroy(Error('Native request timed out; it was not replayed')));
    req.on('error', error => finish(error));
    if (remainingMs !== null)
      timer = setTimeout(() => req.destroy(Error('Native observation deadline; ambiguous, no replay')), remainingMs);
    req.end(JSON.stringify(body, (_, value) => typeof value === 'bigint' ? value.toString() : value));
  });
}

async function call(offset, args) {
  const reply = await request({command: 'call', offset, args});
  return {result: BigInt(reply.result), output: Buffer.from(reply.output, 'base64')};
}
async function callUntil(deadlineNs, offset, args) {
  const reply = await request({command: 'call-until', offset, args,
    deadlineNs: deadlineNs.toString()}, deadlineNs);
  return {result: BigInt(reply.result), output: Buffer.from(reply.output, 'base64')};
}
async function pair(calls) {
  const reply = await request({command: 'pair', calls});
  return {results: reply.results.map(BigInt), output: Buffer.from(reply.output, 'base64')};
}
async function callAddress(address, args) {
  const reply = await request({command: 'call-address', address, args});
  return {result: BigInt(reply.result), output: Buffer.from(reply.output, 'base64')};
}
async function read(address, length) {
  if (!Number.isSafeInteger(address) || !Number.isInteger(length) || length < 0 || length > 0x4000000)
    throw Error('Invalid memory transfer');
  const parts = [];
  for (let offset = 0; offset < length; offset += 0x80000) {
    const size = Math.min(0x80000, length - offset);
    const bytes = Buffer.from((await request({command: 'read', address: address + offset, length: size})).data, 'base64');
    if (bytes.length !== size) throw Error('Memory read was truncated');
    parts.push(bytes);
  }
  return Buffer.concat(parts);
}
async function write(address, bytes) {
  if (!Number.isSafeInteger(address) || !Buffer.isBuffer(bytes) || bytes.length > 0x4000000)
    throw Error('Invalid memory transfer');
  for (let offset = 0; offset < bytes.length; offset += 0x80000)
    await request({command: 'write', address: address + offset,
      data: bytes.subarray(offset, offset + 0x80000).toString('base64')});
}
async function query(address) {
  const result = await request({command: 'query', address});
  return {...result, result: 0, address: Number(result.address), size: Number(result.size)};
}

module.exports = {request, call, callUntil, callAddress, pair, read, write, query, a: addresses,
  output: addresses.scratch + 0x4040,
  directory: path.resolve(__dirname, '..', 'switch' + addresses.platform)};
