'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {main}=require('./english-active-home.cjs');
test('legacy HOME helper fails closed without sending input',async()=>{
  await assert.rejects(main(500),/No portable HOME observation route/);
});
