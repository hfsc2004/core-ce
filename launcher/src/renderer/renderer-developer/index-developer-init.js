/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function () {
  'use strict';

  async function refreshAppVersionDisplay() {
    try {
      const api = window.electronAPI;
      if (!api || typeof api.getCurrentVersion !== 'function') return;
      const result = await api.getCurrentVersion();
      if (!result?.success || !result?.version) return;
      const version = String(result.version).trim();
      const aboutVersionEl = document.getElementById('about-app-version');
      if (aboutVersionEl) aboutVersionEl.textContent = `Version ${version}`;
      const footerVersionEl = document.getElementById('footer-app-version');
      if (footerVersionEl) footerVersionEl.textContent = `v${version}`;

      const stripCompanyPrefix = (productName, companyName) => {
        const p = String(productName || '').trim();
        const c = String(companyName || '').trim();
        if (!p || !c) return p;
        const prefix = `${c} - `;
        if (p.toLowerCase().startsWith(prefix.toLowerCase())) {
          return p.slice(prefix.length).trim() || p;
        }
        return p;
      };

      if (typeof api.getVersionStatus === 'function') {
        const status = await api.getVersionStatus();
        let settings = {};
        if (typeof api.getSettings === 'function') {
          settings = await api.getSettings();
        }
        const year = Number(status?.copyrightYear);
        const footerYearEl = document.getElementById('footer-copyright-year');
        if (footerYearEl && Number.isInteger(year) && year >= 1900 && year <= 3000) {
          footerYearEl.textContent = String(year);
        }
        const branding = status?.branding || {};
        const company = String(branding.companyName || '').trim();
        const product = String(branding.productName || '').trim();
        const website = String(branding.website || '').trim();
        const security = String(branding.securityTag || '').trim();
        const proofState = String(branding.complianceProofState || 'UNVERIFIED').trim().toUpperCase();
        const proofSummary = String(branding.complianceProofSummary || '').trim();
        const proofEvidenceId = String(branding.complianceEvidenceId || '').trim();

        const aboutProductEl = document.getElementById('about-product-name');
        if (aboutProductEl && product) aboutProductEl.textContent = product;

        const footerProductEl = document.getElementById('footer-product-name');
        if (footerProductEl && product) {
          const footerProductText = stripCompanyPrefix(product, company).replace(/Pseudo Science Fiction/gi, 'Pseudo SF');
          footerProductEl.textContent = footerProductText;
        }

        const footerCompanyNameEl = document.getElementById('footer-company-name');
        if (footerCompanyNameEl && company) footerCompanyNameEl.textContent = company;

        const footerCompanyLinkEl = document.getElementById('footer-company-link');
        if (footerCompanyLinkEl && website) footerCompanyLinkEl.setAttribute('href', website);

        const aboutWebsiteBtn = document.getElementById('about-website-link');
        if (aboutWebsiteBtn && website) {
          const safeWebsite = website.replace(/'/g, "\\'");
          aboutWebsiteBtn.textContent = `${company || 'Website'}`;
          aboutWebsiteBtn.setAttribute('onclick', `openExternal('${safeWebsite}')`);
        }

        const footerSecurityEl = document.getElementById('footer-security-tag');
        if (footerSecurityEl && security) {
          const footerSecurityText = /^community edition$/i.test(security)
            ? 'Core [Community Edition]'
            : security;
          footerSecurityEl.textContent = footerSecurityText;
          const enforcement = String(branding.securityEnforcement || '').trim();
          if (enforcement) {
            footerSecurityEl.setAttribute('title', `Enforcement: ${enforcement}`);
          } else {
            footerSecurityEl.removeAttribute('title');
          }
        }

        const footerProofEl = document.getElementById('footer-compliance-proof-tag');
        if (footerProofEl) {
          footerProofEl.textContent = `PROOF:${proofState}`;
          const proofTitleParts = [];
          if (proofEvidenceId) proofTitleParts.push(`Evidence ID: ${proofEvidenceId}`);
          if (proofSummary) proofTitleParts.push(proofSummary);
          if (proofTitleParts.length > 0) {
            footerProofEl.setAttribute('title', proofTitleParts.join('\n'));
          } else {
            footerProofEl.removeAttribute('title');
          }
          const showProof = settings?.show_main_compliance_proof_badge !== false;
          footerProofEl.style.display = showProof ? '' : 'none';
        }
      }
    } catch (_err) {
      // Best-effort UI refresh; ignore non-fatal display errors.
    }
  }

  window.refreshAppVersionDisplay = refreshAppVersionDisplay;

  document.addEventListener('DOMContentLoaded', () => {
    const applyAnimationSettingsOnBoot = async () => {
      try {
        if (!window.electronAPI?.getSettings) return;
        const settings = await window.electronAPI.getSettings();
        const enabled = settings?.animations_enabled !== false;
        document.body.classList.toggle('animations-disabled', !enabled);
        window.__PSF_GATEWAY_UI_DEFAULTS__ = {
          esp32SectionsStartCollapsed: settings?.gateway_esp32_sections_start_collapsed === true
        };
        try {
          localStorage.setItem('psf-gateway-ui-defaults', JSON.stringify(window.__PSF_GATEWAY_UI_DEFAULTS__));
        } catch {
          // ignore storage write failures
        }
      } catch {
        // Best-effort only; keep default animations on if settings can't be read.
      }
    };
    applyAnimationSettingsOnBoot();

    if (window.SettingsModal && typeof window.SettingsModal.loadAndApplyTheme === 'function') {
      window.SettingsModal.loadAndApplyTheme();
    }
    if (window.electronAPI?.onThemeUpdated && window.SettingsModal?.loadAndApplyTheme) {
      window.electronAPI.onThemeUpdated(() => {
        window.SettingsModal.loadAndApplyTheme();
      });
    }

    if (typeof initGpuMonitorWidget === 'function') {
      initGpuMonitorWidget();
    }

    // Global voice prewarm at launcher startup: prepares STT runtime/model
    // without activating microphone capture.
    (async () => {
      try {
        const api = window.electronAPI;
        if (!api || typeof api.voiceToTextGetConfig !== 'function' || typeof api.voiceToTextPrewarmStt !== 'function') {
          return;
        }
        const cfgResult = await api.voiceToTextGetConfig();
        const cfg = cfgResult?.success ? cfgResult.config : null;
        if (cfg?.sttEnabled === true) {
          api.voiceToTextPrewarmStt({ surface: 'launcher-startup', reason: 'app-start' }).catch(() => {});
        }
      } catch (_err) {
        // Best-effort startup warmup; ignore failures here.
      }
    })();

    refreshAppVersionDisplay();
  });
})();
