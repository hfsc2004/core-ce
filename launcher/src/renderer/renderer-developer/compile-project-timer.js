/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function formatElapsedTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  function createTimerController() {
    let compileTimerInterval = null;
    let compileStartTime = null;

    function start() {
      compileStartTime = Date.now();
      const timerDisplay = document.getElementById('compile-timer');
      if (timerDisplay) {
        timerDisplay.style.display = 'block';
        timerDisplay.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: rgba(0,212,255,0.1); border-radius: 8px; border: 1px solid rgba(0,212,255,0.3);">
            <span style="color: #00d4ff; font-size: 14px;">⏱️ Elapsed:</span>
            <span id="compile-timer-value" style="color: #fff; font-family: monospace; font-size: 20px; font-weight: bold;">00:00:00</span>
            <span id="compile-timer-status" style="color: #00ff88; font-size: 12px; margin-left: auto;">Running...</span>
          </div>
        `;
      }

      compileTimerInterval = setInterval(() => {
        const elapsed = Date.now() - compileStartTime;
        const timerValue = document.getElementById('compile-timer-value');
        if (timerValue) timerValue.textContent = formatElapsedTime(elapsed);
      }, 1000);
    }

    function stop(success = true) {
      if (compileTimerInterval) {
        clearInterval(compileTimerInterval);
        compileTimerInterval = null;
      }

      const elapsed = compileStartTime ? Date.now() - compileStartTime : 0;
      const finalTime = formatElapsedTime(elapsed);
      const timerDisplay = document.getElementById('compile-timer');

      if (timerDisplay && compileStartTime) {
        const bgColor = success ? 'rgba(0,255,136,0.1)' : 'rgba(255,107,107,0.1)';
        const borderColor = success ? 'rgba(0,255,136,0.3)' : 'rgba(255,107,107,0.3)';
        const statusColor = success ? '#00ff88' : '#ff6b6b';
        const statusText = success ? '✓ Complete' : '✗ Failed';
        timerDisplay.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: ${bgColor}; border-radius: 8px; border: 1px solid ${borderColor};">
            <span style="color: #00d4ff; font-size: 14px;">⏱️ Total Time:</span>
            <span style="color: #fff; font-family: monospace; font-size: 20px; font-weight: bold;">${finalTime}</span>
            <span style="color: ${statusColor}; font-size: 12px; margin-left: auto;">${statusText}</span>
          </div>
        `;
      }
      return finalTime;
    }

    return { start, stop, formatElapsedTime };
  }

  window.CompileProjectTimer = {
    createTimerController
  };
})();
