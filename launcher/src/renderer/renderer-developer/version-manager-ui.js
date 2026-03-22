/**
 * Pseudo Science Fiction Core Collection - Version Manager UI
 * Renderer process version management interface
 * 
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 * @license SEE LICENSE.txt
 */

// VERSION MANAGER
// ============================================================================

async function loadVersionManager() {
  try {
    const result = await window.electronAPI.getCurrentVersion();
    if (result.success) {
      document.getElementById('current-version').textContent = result.version;
    } else {
      document.getElementById('current-version').textContent = 'Unknown';
      console.error('Failed to get current version:', result.message);
    }

    if (window.electronAPI?.getVersionStatus) {
      const status = await window.electronAPI.getVersionStatus();
      const branding = status?.branding || {};
      const companyInput = document.getElementById('branding-company-input');
      const productInput = document.getElementById('branding-product-input');
      const websiteInput = document.getElementById('branding-website-input');
      const securityInput = document.getElementById('branding-security-input');
      if (companyInput && !companyInput.value) companyInput.value = String(branding.companyName || '');
      if (productInput && !productInput.value) productInput.value = String(branding.productName || '');
      if (websiteInput && !websiteInput.value) websiteInput.value = String(branding.website || '');
      if (securityInput) {
        securityInput.value = String(branding.securityTag || 'AUTO');
        const enforcement = String(branding.securityEnforcement || '').trim();
        if (enforcement) {
          securityInput.title = `Enforcement (auto-detected): ${enforcement}`;
        } else {
          securityInput.removeAttribute('title');
        }
      }
    }
    
    // Set default copyright year to current year
    const copyrightYearInput = document.getElementById('copyright-year-input');
    if (copyrightYearInput && !copyrightYearInput.value) {
      copyrightYearInput.value = new Date().getFullYear();
    }
  } catch (err) {
    document.getElementById('current-version').textContent = 'Error';
    console.error('Error loading version:', err);
  }
}

async function updateVersion() {
  const newVersion = document.getElementById('new-version-input').value.trim();
  const copyrightYearInput = document.getElementById('copyright-year-input');
  const copyrightYear = copyrightYearInput ? parseInt(copyrightYearInput.value, 10) : new Date().getFullYear();
  const branding = {
    companyName: String(document.getElementById('branding-company-input')?.value || '').trim(),
    productName: String(document.getElementById('branding-product-input')?.value || '').trim(),
    website: String(document.getElementById('branding-website-input')?.value || '').trim()
  };
  
  if (!newVersion) {
    alert('Please enter a new version number');
    return;
  }
  
  // Validate version format (basic)
  if (!/^\d+\.\d+\.\d+[a-z]?$/.test(newVersion)) {
    alert('Invalid version format. Use format: X.Y.Z or X.Y.Za (e.g., 1.0.3 or 1.0.3a)');
    return;
  }
  
  // Validate copyright year
  if (isNaN(copyrightYear) || copyrightYear < 2020 || copyrightYear > 2100) {
    alert('Invalid copyright year. Please enter a valid year (2020-2100).');
    return;
  }
  if (!branding.companyName || !branding.productName || !branding.website) {
    alert('Please complete Company Name, Product Name, and Website URL.');
    return;
  }
  if (!/^https?:\/\//i.test(branding.website)) {
    alert('Website URL must start with http:// or https://');
    return;
  }
  
  if (!confirm(`Update version to ${newVersion} with copyright year ${copyrightYear}?\n\nThis will update all project files with version tags and copyright notices.\n\nThis action cannot be undone!`)) {
    return;
  }
  
  // Show loading state
  const updateBtn = document.querySelector('button[onclick="updateVersion()"]');
  let originalText = 'Update Version';
  if (updateBtn) {
    originalText = updateBtn.textContent;
    updateBtn.disabled = true;
    updateBtn.textContent = 'Updating...';
  }
  
  try {
    const result = await window.electronAPI.updateVersion(newVersion, copyrightYear, branding);
    
    if (result.success) {
      // Show success details in scrollable modal
      let message = `Version updated to ${newVersion}!\n`;
      message += `Copyright year: ${copyrightYear}\n\n`;
      message += `Summary: ${result.message}\n`;
      message += `---------------------------------------------\n\n`;
      
      if (result.updated.length > 0) {
        message += `UPDATED FILES (${result.updated.length}):\n`;
        result.updated.forEach(file => {
          message += `  [OK] ${file}\n`;
        });
        message += '\n';
      }
      
      if (result.skipped && result.skipped.length > 0) {
        message += `SKIPPED FILES (${result.skipped.length}):\n`;
        message += `  (No version pattern found)\n\n`;
      }
      
      if (result.failed.length > 0) {
        message += `FAILED FILES (${result.failed.length}):\n`;
        result.failed.forEach(item => {
          message += `  [FAIL] ${item.file}: ${item.error}\n`;
        });
      }
      
      showScrollableModal('Version Update Complete', message, 'success');
      
      // Update current version display
      document.getElementById('current-version').textContent = newVersion;
      document.getElementById('new-version-input').value = '';
      if (typeof window.refreshAppVersionDisplay === 'function') {
        window.refreshAppVersionDisplay();
      }
      
      // Suggest restart only when backend did not schedule one automatically.
      if (!result.restartScheduled) {
        const modalOkBtn = document.querySelector('#scrollable-modal button');
        if (modalOkBtn) {
          modalOkBtn.addEventListener('click', () => {
            setTimeout(() => {
              if (confirm('Restart the application to see all changes?\n\n(You can also restart manually later)')) {
                location.reload();
              }
            }, 100);
          }, { once: true });
        }
      }
    } else {
      showScrollableModal('Version Update Failed', result.message, 'error');
    }
  } catch (err) {
    console.error('Version update error:', err);
    showScrollableModal('Version Update Error', err.message, 'error');
  } finally {
    if (updateBtn) {
      updateBtn.disabled = false;
      updateBtn.textContent = originalText;
    }
  }
}

async function createLightweightClone() {
  if (!window.electronAPI?.createLightweightProjectClone) {
    alert('Lightweight clone API is unavailable in this build.');
    return;
  }

  if (!confirm(
    'Create lightweight project clone now?\n\n' +
    'This will copy project source files into a sibling folder (without _WORK) and create a ZIP archive.\n\n' +
    'Excluded: binaries/, models/*/ subfolders, node_modules/, .git/, dist/\n' +
    'Included: files directly under models/'
  )) {
    return;
  }

  const cloneBtn = document.querySelector('button[onclick="createLightweightClone()"]');
  const originalText = cloneBtn ? cloneBtn.textContent : 'Clone Project (Lightweight + ZIP)';
  if (cloneBtn) {
    cloneBtn.disabled = true;
    cloneBtn.textContent = 'Cloning...';
  }

  try {
    const result = await window.electronAPI.createLightweightProjectClone();
    if (!result?.success) {
      showScrollableModal(
        'Lightweight Clone Failed',
        result?.message || 'Unknown error creating lightweight clone.',
        'error'
      );
      return;
    }

    const details = [
      'Lightweight clone created successfully.',
      '',
      `Clone directory: ${result.cloneDir || '(unknown)'}`,
      `ZIP file: ${result.zipPath || '(unknown)'}`,
      `Copied files: ${result.copiedFiles ?? 'n/a'}`,
      `ZIP size: ${result.zipSizeMB ? `${result.zipSizeMB} MB` : 'n/a'}`
    ].join('\n');
    showScrollableModal('Lightweight Clone Complete', details, 'success');
  } catch (err) {
    console.error('Lightweight clone error:', err);
    showScrollableModal('Lightweight Clone Error', err.message || String(err), 'error');
  } finally {
    if (cloneBtn) {
      cloneBtn.disabled = false;
      cloneBtn.textContent = originalText;
    }
  }
}

// ============================================================================
