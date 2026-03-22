/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// ============================================================================
// PSF OFFLINE ARCHIVE COLLECTION
// Renderer - Delete Data
// ============================================================================
// Standard Edition feature for user data management
// ============================================================================

async function deleteData(mode) {
  let message;
  let confirmMessage;
  
  if (mode === 'keep-settings') {
    confirmMessage = '⚠️ Delete User Data?\n\nThis will remove:\n• Conversations\n• Users\n• Uploads\n• Cache\n• Voice recordings\n• Temp files\n\nModel configurations, system prompts, functions, and tools will be kept.\n\nAre you sure?';
    message = 'Deleting user data (keeping settings)...';
  } else if (mode === 'everything') {
    confirmMessage = '🚨 DELETE EVERYTHING?\n\nThis will remove ALL data including:\n• Conversations\n• Users  \n• Uploads\n• Cache\n• Voice recordings\n• Temp files\n• Model configurations\n• System prompts\n• Functions\n• Tools\n\nThis is a complete factory reset of Open WebUI.\n\nAre you absolutely sure?';
    message = 'Performing factory reset...';
  } else {
    alert('Unknown delete mode: ' + mode);
    return;
  }
  
  if (!confirm(confirmMessage)) {
    return;
  }
  
  // Double-confirm for 'everything' mode
  if (mode === 'everything') {
    if (!confirm('⚠️ FINAL WARNING\n\nThis action cannot be undone.\n\nType "DELETE" to confirm... (click OK to proceed)')) {
      return;
    }
  }
  
  try {
    // TODO: Implement actual deletion via IPC
    // const result = await window.electronAPI.deleteUserData(mode);
    
    // Placeholder implementation
    console.log(`Delete data requested: ${mode}`);
    
    alert(`${message}\n\nThis feature is coming soon.\n\nFor now, you can manually delete data from the 'webui-data/' folder in the application directory.`);
    
  } catch (err) {
    console.error('Delete data failed:', err);
    alert(`❌ Failed to delete data:\n${err.message}`);
  }
}

// ============================================================================
