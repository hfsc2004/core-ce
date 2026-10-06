'use strict';
// BMOC-private worker: reads one temporary sequence file, returns scalars and
// internal layout/cost metadata. No HTTP/model APIs or recurrent-state writes.
const { parentPort,workerData }=require('node:worker_threads');
try {
  const { file,layout,seed,allowEmpty }=workerData;
  parentPort.postMessage({ result:require('./session-manager-rwkv-observation').projectFile(file,layout,seed,allowEmpty) });
} catch (err) { parentPort.postMessage({ error:err.message }); }
