/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Settings Modal template helper (about tab)
 * Extracted from settings-modal-templates-tabs.js (structural split only).
 */

function getAboutTabHTML() {
  return `
    <div class="about-header">
      <h3 id="settings-about-product-name">Pseudo Science Fiction - Core</h3>
      <div class="version" id="settings-about-version">Version loading...</div>
      <div class="edition">Community Edition</div>
    </div>
    
    <div class="about-section">
      <h4 style="font-size: 105%;">
        <svg width="21" height="21" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="vertical-align:-4px; margin-right:7px;">
          <path d="M4 2.5h6l2 2v9H4z"></path>
          <path d="M10 2.5v2h2"></path>
          <path d="M5.5 8h5M5.5 10h4"></path>
        </svg>
        Documentation
      </h4>
      <div class="about-buttons">
        <button class="about-btn" onclick="openDocs('README.md')">Quick Start Guide</button>
        <button class="about-btn" onclick="openDocs('TROUBLESHOOTING.md')">Troubleshooting</button>
      </div>
    </div>
    
    <div class="about-section">
      <h4 style="font-size: 105%;">
        <svg width="21" height="21" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="vertical-align:-4px; margin-right:7px;">
          <path d="M8 2.2v10.5"></path>
          <path d="M4.2 4.2h7.6"></path>
          <path d="M5.2 4.2 3.4 7.2h3.6zM12.6 7.2H9l1.8-3z"></path>
          <path d="M5.4 11.8h5.2"></path>
        </svg>
        Licenses
      </h4>
      <div class="about-buttons">
        <button class="about-btn" onclick="openDocs('LICENSE.txt')">Master License</button>
        <button class="about-btn" onclick="openDocs('ATTRIBUTIONS.md')">Model Attributions</button>
        <button class="about-btn" onclick="openDocs('docs/reference/IP_OWNERSHIP_AND_ATTRIBUTION.md')">IP Ownership Policy</button>
        <button class="about-btn" onclick="openDocs('docs/reference/ProvenanceMatrix.md')">Provenance Matrix</button>
      </div>
    </div>
    
    <div class="about-section">
      <h4 style="font-size: 105%;">
        <svg width="21" height="21" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="vertical-align:-4px; margin-right:7px;">
          <path d="M6.4 9.6 9.6 6.4"></path>
          <path d="M5.2 11.8H4a2.8 2.8 0 1 1 0-5.6h1.8"></path>
          <path d="M10.8 4.2H12a2.8 2.8 0 1 1 0 5.6h-1.8"></path>
        </svg>
        Links
      </h4>
      <div class="about-buttons">
        <button id="settings-about-website-link" class="about-btn" onclick="openExternal('https://pseudosf.com')">Pseudo Science Fiction Website</button>
        <button class="about-btn" onclick="openExternal('https://github.com/psfrobotics')">GitHub</button>
      </div>
    </div>

    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #333; text-align: center; color: #666; font-size: 12px;">
      © <span id="settings-about-copyright-year">2026</span>
      <a id="settings-about-company-link" href="https://pseudosf.com" target="_blank" rel="noopener" style="color:var(--psf-footer-link, #ffffff); text-decoration:none; font-weight:700;">
        <span id="settings-about-company-name">Pseudo Science Fiction</span>
      </a>
      - <span id="settings-about-security-tag">Community Edition</span>
      <span id="settings-about-proof-tag"> - PROOF:UNVERIFIED</span>
    </div>
  `;
}
