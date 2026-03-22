
// ============================================================================
// Application Lifecycle
// ============================================================================

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Track if we're already shutting down to prevent double-cleanup
let isShuttingDown = false;

app.on('before-quit', (e) => {
  if (isShuttingDown) return;
  
  // Prevent immediate quit
  e.preventDefault();
  isShuttingDown = true;
  
  console.log('[App] Shutting down ${config.productName}...');
  
  // Clean up all sessions via BMOC-Lite (Good House Guest)
  sessionManager.shutdownAll().then(() => {
    console.log('[App] Cleanup complete, exiting');
    app.exit(0);
  }).catch((err) => {
    console.error('[App] Cleanup error:', err);
    app.exit(1);
  });
});
