/**
 *
 * @version 1.1.2 - March 5, 2026
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
      <h4>📄 Documentation</h4>
      <div class="about-buttons">
        <button class="about-btn" onclick="openDocs('README.md')">Quick Start Guide</button>
        <button class="about-btn" onclick="openDocs('TROUBLESHOOTING.md')">Troubleshooting</button>
      </div>
    </div>
    
    <div class="about-section">
      <h4>⚖️ Licenses</h4>
      <div class="about-buttons">
        <button class="about-btn" onclick="openDocs('LICENSE.txt')">Master License</button>
        <button class="about-btn" onclick="openDocs('ATTRIBUTIONS.md')">Model Attributions</button>
        <button class="about-btn" onclick="openDocs('docs/reference/IP_OWNERSHIP_AND_ATTRIBUTION.md')">IP Ownership Policy</button>
        <button class="about-btn" onclick="openDocs('docs/reference/ProvenanceMatrix.md')">Provenance Matrix</button>
      </div>
    </div>
    
    <div class="about-section">
      <h4>🔗 Links</h4>
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
