'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {main}=require('./english-active-capture.cjs');
test('legacy capture helper fails closed without host paths',async()=>{
  await assert.rejects(main(500),/No portable HDMI capture/);
});
