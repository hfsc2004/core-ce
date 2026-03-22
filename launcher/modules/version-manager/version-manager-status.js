/**
 * Version manager status checks.
 */

const fs = require('fs');
const path = require('path');
const {
  readBrandingMetadata,
  deriveSecurityProfile
} = require('./version-manager-branding-security');
const { readComplianceEvidence } = require('./version-manager-compliance');

async function getVersionStatus(fromPath) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const modelsDir = path.join(projectRoot, 'models');
    const srcDir = path.join(fromPath, 'src');
    const modulesDir = path.join(fromPath, 'modules');

    const versions = {};

    // Check package.json (source of truth)
    const packagePath = path.join(fromPath, 'package.json');
    if (fs.existsSync(packagePath)) {
      const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      versions['package.json'] = packageData.version;
    }

    // Check main.js
    const mainJsPath = path.join(fromPath, 'main.js');
    if (fs.existsSync(mainJsPath)) {
      const content = fs.readFileSync(mainJsPath, 'utf8');
      const match = content.match(/\/\/ Version: (\d+\.\d+\.\d+[a-z]?)/);
      if (match) {
        versions['main.js'] = match[1];
      }
    }

    // Check HTML files
    const htmlFiles = ['index.html', 'index-developer.html'];
    for (const htmlFile of htmlFiles) {
      const htmlPath = path.join(srcDir, htmlFile);
      if (fs.existsSync(htmlPath)) {
        const content = fs.readFileSync(htmlPath, 'utf8');
        const match = content.match(/<p>Version (\d+\.\d+\.\d+[a-z]?)<\/p>/);
        if (match) {
          versions[`src/${htmlFile}`] = match[1];
        }
      }
    }

    // Check JSON config/catalog files
    const jsonFiles = [
      { path: path.join(modelsDir, 'sku-config.json'), name: 'models/sku-config.json' },
      { path: path.join(modelsDir, 'catalog.json'), name: 'models/catalog.json' },
      { path: path.join(modelsDir, 'catalog-master.json'), name: 'models/catalog-master.json' }
    ];

    // Add SKU catalogs dynamically
    if (fs.existsSync(modelsDir)) {
      const skuFiles = fs.readdirSync(modelsDir)
        .filter((f) => f.startsWith('catalog-sku-') && f.endsWith('.json'));
      for (const skuFile of skuFiles) {
        jsonFiles.push({ path: path.join(modelsDir, skuFile), name: `models/${skuFile}` });
      }
    }

    for (const { path: filePath, name } of jsonFiles) {
      if (fs.existsSync(filePath)) {
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          if (data.version) {
            versions[name] = data.version;
          }
        } catch (err) {
          versions[name] = 'ERROR';
        }
      }
    }

    // Sample check some module files
    const moduleFiles = [
      'ollama-manager/ollama-manager.js',
      'gpu-detector/gpu-detector.js',
      'path-manager/path-manager.js',
      'catalog-manager.js',
      'version-manager/version-manager.js'
    ];

    for (const moduleFile of moduleFiles) {
      const modulePath = path.join(modulesDir, moduleFile);
      if (fs.existsSync(modulePath)) {
        const content = fs.readFileSync(modulePath, 'utf8');
        const match = content.match(/@version (\d+\.\d+\.\d+[a-z]?)/);
        if (match) {
          versions[`modules/${moduleFile}`] = match[1];
        }
      }
    }

    // Extract current copyright year from main.js header metadata
    let copyrightYear = null;
    if (fs.existsSync(mainJsPath)) {
      const mainContent = fs.readFileSync(mainJsPath, 'utf8');
      const yearMatch = mainContent.match(/@copyright\s+(\d{4})/i)
        || mainContent.match(/Copyright\s*[©]?\s*(\d{4})/i);
      if (yearMatch && yearMatch[1]) {
        const parsedYear = parseInt(yearMatch[1], 10);
        if (!Number.isNaN(parsedYear)) copyrightYear = parsedYear;
      }
    }

    const brandingInfo = readBrandingMetadata(fromPath);
    const securityProfile = deriveSecurityProfile();
    const complianceEvidence = readComplianceEvidence(fromPath);
    const runtimeSecurityTag = securityProfile.securityTag;

    // Check for inconsistencies
    const truthVersion = versions['package.json'];
    const inconsistent = [];

    for (const [file, version] of Object.entries(versions)) {
      if (file !== 'package.json' && version !== truthVersion) {
        inconsistent.push({ file, version, expected: truthVersion });
      }
    }

    return {
      success: true,
      versions,
      inconsistent,
      truthVersion,
      copyrightYear,
      branding: {
        ...brandingInfo.branding,
        securityTag: runtimeSecurityTag,
        securityEnforcement: securityProfile.enforcement,
        complianceProofState: complianceEvidence.state,
        complianceProofSummary: complianceEvidence.summary,
        complianceEvidenceId: String(complianceEvidence?.evidence?.evidenceId || '').trim()
      },
      totalChecked: Object.keys(versions).length,
      message: inconsistent.length === 0
        ? `All ${Object.keys(versions).length} checked files are consistent at v${truthVersion}`
        : `${inconsistent.length} of ${Object.keys(versions).length} files have inconsistent versions`
    };
  } catch (err) {
    console.error('[Version Manager] Error checking version status:', err);
    return { success: false, message: err.message };
  }
}

module.exports = {
  getVersionStatus
};

