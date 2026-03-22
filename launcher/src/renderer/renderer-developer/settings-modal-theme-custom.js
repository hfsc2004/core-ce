/**
 * Settings Modal - Theme custom profile persistence/actions
 * Split from settings-modal-theme.js to keep modules focused.
 *
 * @version 1.1.2 - March 5, 2026
 */

function getThemeStorageSM() {
  const themes = JSON.parse(localStorage.getItem('psf-themes') || '{}');
  if (!themes.customProfiles || typeof themes.customProfiles !== 'object') {
    themes.customProfiles = {};
  }
  return themes;
}

function setThemeStorageSM(themes) {
  localStorage.setItem('psf-themes', JSON.stringify(themes));
}

function refreshCustomThemeList(selectedName = '') {
  const select = document.getElementById('theme-custom-select');
  if (!select) return;

  const themes = getThemeStorageSM();
  const names = Object.keys(themes.customProfiles || {}).sort((a, b) => a.localeCompare(b));

  select.innerHTML = '<option value="">Select saved custom theme...</option>';
  names.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });

  if (selectedName && names.includes(selectedName)) {
    select.value = selectedName;
  }
}

function saveThemeCustom() {
  const input = document.getElementById('theme-custom-name');
  const statusDiv = document.getElementById('theme-status');
  const name = (input?.value || '').trim();
  if (!name) {
    if (statusDiv) statusDiv.innerHTML = '<span style="color: var(--psf-warning, #ffd400);">Enter a profile name first.</span>';
    return;
  }
  if (!settingsModalState.currentTheme) {
    if (statusDiv) statusDiv.innerHTML = '<span style="color: var(--psf-error, #ff6b6b);">No active theme to save.</span>';
    return;
  }

  const themes = getThemeStorageSM();
  themes.customProfiles[name] = { ...settingsModalState.currentTheme };
  setThemeStorageSM(themes);
  refreshCustomThemeList(name);

  if (statusDiv) statusDiv.innerHTML = `<span style="color: var(--psf-success, #00ff88);">Saved custom theme "${name}".</span>`;
}

function loadThemeCustom() {
  const select = document.getElementById('theme-custom-select');
  const statusDiv = document.getElementById('theme-status');
  const name = (select?.value || '').trim();
  if (!name) {
    if (statusDiv) statusDiv.innerHTML = '<span style="color: var(--psf-warning, #ffd400);">Select a custom theme to load.</span>';
    return;
  }

  const themes = getThemeStorageSM();
  const customTheme = themes.customProfiles?.[name];
  if (!customTheme || typeof customTheme !== 'object') {
    if (statusDiv) statusDiv.innerHTML = `<span style="color: var(--psf-error, #ff6b6b);">Custom theme "${name}" was not found.</span>`;
    refreshCustomThemeList();
    return;
  }

  settingsModalState.currentTheme = { ...customTheme };

  Object.keys(settingsModalState.currentTheme).forEach((key) => {
    const input = document.getElementById(`theme-color-${key}`);
    const valueDisplay = document.getElementById(`theme-value-${key}`);
    if (input) input.value = hexFromColorSM(settingsModalState.currentTheme[key]);
    if (valueDisplay) valueDisplay.textContent = settingsModalState.currentTheme[key];
  });

  updateThemePreview();
  document.querySelectorAll('.theme-preset-btn').forEach((btn) => btn.classList.remove('active'));
  refreshCustomThemeList(name);

  if (statusDiv) statusDiv.innerHTML = `<span style="color: var(--psf-accent, #00d4ff);">Loaded custom theme "${name}". Click "Apply & Save" to apply globally.</span>`;
}

function deleteThemeCustom() {
  const select = document.getElementById('theme-custom-select');
  const statusDiv = document.getElementById('theme-status');
  const name = (select?.value || '').trim();
  if (!name) {
    if (statusDiv) statusDiv.innerHTML = '<span style="color: var(--psf-warning, #ffd400);">Select a custom theme to delete.</span>';
    return;
  }

  const themes = getThemeStorageSM();
  if (!themes.customProfiles?.[name]) {
    if (statusDiv) statusDiv.innerHTML = `<span style="color: var(--psf-error, #ff6b6b);">Custom theme "${name}" was not found.</span>`;
    refreshCustomThemeList();
    return;
  }

  delete themes.customProfiles[name];
  setThemeStorageSM(themes);
  refreshCustomThemeList();

  if (statusDiv) statusDiv.innerHTML = `<span style="color: var(--psf-success, #00ff88);">Deleted custom theme "${name}".</span>`;
}
