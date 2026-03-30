/**
 *
 * @version 1.1.3 - March 9, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { BrowserWindow } = require('electron');
const logger = require('./logger');

const DEFAULT_INTERVAL_MS = 1000;

function safeMkdir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (_) {}
}

function writeJsonAtomic(filePath, payload) {
  try {
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(payload), 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (_) {}
}

function createCanaryMonitor(options = {}) {
  const appDir = String(options.appDir || process.cwd());
  const getSessionSummary = typeof options.getSessionSummary === 'function'
    ? options.getSessionSummary
    : () => ({});

  const runtimeDir = path.join(appDir, '..', '.psf', 'runtime', 'canary');
  const heartbeatPath = path.join(runtimeDir, 'heartbeat.json');
  const controlPath = path.join(runtimeDir, 'control.json');
  const workerPath = path.join(__dirname, 'canary-worker.js');

  let workerProcess = null;
  let heartbeatTimer = null;

  function heartbeatTick() {
    const mem = process.memoryUsage();
    const payload = {
      ts: Date.now(),
      pid: process.pid,
      uptimeSec: Math.floor(process.uptime()),
      memory: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
        arrayBuffers: mem.arrayBuffers
      },
      windowCount: BrowserWindow.getAllWindows().length,
      sessions: getSessionSummary() || {}
    };
    writeJsonAtomic(heartbeatPath, payload);
  }

  function start() {
    safeMkdir(runtimeDir);
    writeJsonAtomic(controlPath, {
      maxBytes: 512 * 1024,
      keepFiles: 4,
      heartbeatStaleMs: 7000
    });

    if (!workerProcess || workerProcess.killed) {
      const args = [
        workerPath,
        '--heartbeat', heartbeatPath,
        '--control', controlPath,
        '--runtime-dir', runtimeDir,
        '--parent-pid', String(process.pid)
      ];
      workerProcess = spawn(process.execPath, args, {
        cwd: appDir,
        detached: true,
        stdio: 'ignore'
      });
      workerProcess.unref();
      logger.info('[Canary] Worker started', { pid: workerProcess.pid, runtimeDir });
    }

    if (!heartbeatTimer) {
      heartbeatTick();
      heartbeatTimer = setInterval(heartbeatTick, Number(options.intervalMs || DEFAULT_INTERVAL_MS));
      if (typeof heartbeatTimer.unref === 'function') {
        heartbeatTimer.unref();
      }
    }
  }

  function stop() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    writeJsonAtomic(controlPath, {
      stopRequested: true,
      ts: Date.now()
    });
  }

  return {
    start,
    stop
  };
}

module.exports = createCanaryMonitor;

