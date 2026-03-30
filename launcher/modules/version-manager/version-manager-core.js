/**
 * Pseudo Science Fiction Core Collection - Version Manager Core
 * Main version management functions
 * 
 * @module version-manager-core
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 * @license SEE LICENSE.txt
 */

const fs = require('fs');
const path = require('path');
const config = require('./version-manager-config');
const utils = require('./version-manager-utils');
const patterns = require('./version-manager-patterns');
const filePathsGenerator = require('./file-paths-generator');
const projectFilesGenerator = require('./project-files-generator');
const { buildWorkspaceRenamePlan } = require('./version-manager-rename-plan');
const { createLightweightProjectClone } = require('./version-manager-light-clone');
const {
  getDefaultBrandingMetadata,
  normalizeBrandingMetadata,
  deriveSecurityProfile,
  writeBrandingMetadata
} = require('./version-manager-branding-security');
const {
  getComplianceEvidenceStatus,
  saveComplianceEvidence,
  addComplianceTrustedKey,
  removeComplianceTrustedKey,
  signComplianceEvidence
} = require('./version-manager-compliance');
const { getVersionStatus } = require('./version-manager-status');

// ============================================================================
// GET CURRENT VERSION
// ============================================================================

/**
 * Get current version from package.json (single source of truth)
 * 
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {Promise<Object>} { success, version, message }
 */
async function getCurrentVersion(fromPath) {
  try {
    const packagePath = path.join(fromPath, 'package.json');
    
    if (!fs.existsSync(packagePath)) {
      return { success: false, message: 'package.json not found' };
    }
    
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const version = packageData.version;
    
    if (!version) {
      return { success: false, message: 'No version field in package.json' };
    }
    
    console.log(`[Version Manager] Current version: ${version}`);
    return { success: true, version };
    
  } catch (err) {
    console.error('[Version Manager] Error reading current version:', err);
    return { success: false, message: err.message };
  }
}

function forceUpdatePackageVersion(fromPath, newVersion) {
  const packagePath = path.join(fromPath, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return { updated: false, reason: 'package.json not found' };
  }
  const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  if (packageData.version === newVersion) {
    return { updated: false, reason: 'already_current' };
  }
  packageData.version = newVersion;
  fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2) + '\n', 'utf8');
  return { updated: true, path: packagePath };
}

// ============================================================================
// UPDATE VERSION IN ALL FILES
// ============================================================================

/**
 * Update version across all project files
 * 
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} newVersion - New version string (e.g., "1.0.9a")
 * @param {number} [copyrightYear] - Copyright year to update (optional, defaults to current year)
 * @returns {Promise<Object>} { success, updated, failed, skipped, message }
 */
async function updateVersion(fromPath, newVersion, copyrightYear, brandingMetadata = null) {
  try {
    // Validate version format
    if (!utils.isValidVersion(newVersion)) {
      return { 
        success: false, 
        message: `Invalid version format: "${newVersion}". Use format: X.Y.Z or X.Y.Za` 
      };
    }
    
    // Default copyright year to current year if not provided
    const effectiveCopyrightYear = copyrightYear || config.DEFAULT_COPYRIGHT_YEAR;
    const securityProfile = deriveSecurityProfile();
    const runtimeSecurityTag = securityProfile.securityTag;
    const normalizedBranding = normalizeBrandingMetadata(brandingMetadata || {});
    
    console.log(`[Version Manager] ========================================`);
    console.log(`[Version Manager] Updating ALL files to version: ${newVersion}`);
    console.log(`[Version Manager] Copyright year: ${effectiveCopyrightYear}`);
    console.log(`[Version Manager] ========================================`);
    
    const projectRoot = path.join(fromPath, '..');
    const currentVersionInfo = await getCurrentVersion(fromPath);
    const currentVersion = currentVersionInfo?.success ? currentVersionInfo.version : null;
    const renamePlan = buildWorkspaceRenamePlan(projectRoot, newVersion);
    const modelsDir = path.join(projectRoot, 'models');
    
    // Format date for version headers
    const dateFormatted = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const today = new Date().toISOString().split('T')[0];
    
    const results = {
      updated: [],
      failed: [],
      skipped: []
    };
    
    // ========================================================================
    // 1. Find ALL taggable files in launcher directory
    // ========================================================================
    console.log(`[Version Manager] Scanning: ${fromPath}`);
    const launcherFiles = utils.findTaggableFiles(fromPath);
    console.log(`[Version Manager] Found ${launcherFiles.length} taggable files in launcher`);
    
    // ========================================================================
    // 2. Find ALL taggable files in models directory (catalogs)
    // ========================================================================
    console.log(`[Version Manager] Scanning: ${modelsDir}`);
    const modelsFiles = utils.findTaggableFiles(modelsDir);
    console.log(`[Version Manager] Found ${modelsFiles.length} taggable files in models`);
    
    // ========================================================================
    // 3. Find ALL taggable files in project root (scripts, etc.)
    // ========================================================================
    const rootFiles = [];
    if (fs.existsSync(projectRoot)) {
      const rootItems = fs.readdirSync(projectRoot);
      for (const item of rootItems) {
        const itemPath = path.join(projectRoot, item);
        try {
          const stat = fs.statSync(itemPath);
          if (stat.isFile() && !utils.shouldSkipFile(itemPath)) {
            rootFiles.push(itemPath);
          }
        } catch (err) {
          // Skip
        }
      }
    }
    console.log(`[Version Manager] Found ${rootFiles.length} taggable files in project root`);
    
    // ========================================================================
    // 4. Combine all files and process
    // ========================================================================
    const allFiles = [...launcherFiles, ...modelsFiles, ...rootFiles];
    console.log(`[Version Manager] Processing ${allFiles.length} total files...`);
    console.log(`[Version Manager] ----------------------------------------`);
    
    for (const filePath of allFiles) {
      const relativePath = path.relative(projectRoot, filePath);
      
      try {
        const updated = patterns.updateFileVersion(
          filePath,
          newVersion,
          dateFormatted,
          today,
          effectiveCopyrightYear,
          currentVersion,
          { ...normalizedBranding, securityTag: runtimeSecurityTag }
        );
        
        if (updated) {
          results.updated.push(relativePath);
          console.log(`[Version Manager] [OK] ${relativePath}`);
        } else {
          results.skipped.push(relativePath);
        }
      } catch (err) {
        results.failed.push({ file: relativePath, error: err.message });
        console.error(`[Version Manager] [FAIL] ${relativePath}: ${err.message}`);
      }
    }
    
    // ========================================================================
    // 5. Rename all versioned documentation files to match new version
    // ========================================================================
    try {
      const renamedDocs = utils.renameVersionedDocuments(projectRoot, newVersion, currentVersion);
      for (const doc of renamedDocs) {
        results.updated.push(doc.message);
        console.log(`[Version Manager] [OK] ${doc.message}`);
      }
    } catch (err) {
      results.failed.push({ file: 'Versioned docs', error: err.message });
      console.error(`[Version Manager] [FAIL] Versioned docs rename: ${err.message}`);
    }

    // ========================================================================
    // 6. Rewrite stale absolute WORK paths in runtime/config files
    // ========================================================================
    try {
      const migration = utils.rewriteAbsoluteWorkspacePaths(
        projectRoot,
        renamePlan?.required ? renamePlan.to : projectRoot
      );
      if (migration.updated > 0) {
        for (const f of migration.files) {
          const msg = `Path-migrated ${f}`;
          results.updated.push(msg);
          console.log(`[Version Manager] [OK] ${msg}`);
        }
      }
      console.log(
        `[Version Manager] Path migration scan complete: ` +
        `${migration.updated}/${migration.scanned} files updated`
      );
    } catch (err) {
      results.failed.push({ file: 'Path migration', error: err.message });
      console.error(`[Version Manager] [FAIL] Path migration: ${err.message}`);
    }

    // ========================================================================
    // 7. Rewrite Codex session CWD metadata for `codex resume`
    // ========================================================================
    try {
      const codexPlans = [];
      const pushCodexPlan = (fromRoot, toRoot) => {
        const from = String(fromRoot || '').trim();
        const to = String(toRoot || '').trim();
        if (!from || !to || from === to) return;
        codexPlans.push({ from, to });
      };

      if (renamePlan?.required) {
        pushCodexPlan(projectRoot, renamePlan.to);
      } else if (currentVersion && newVersion && currentVersion !== newVersion) {
        // Defensive fallback: when workspace already appears renamed (or symlinked),
        // still migrate Codex metadata from old-version sibling root to current root.
        const trySwap = (root) => {
          const markerNew = `_${newVersion}_WORK`;
          const markerOld = `_${currentVersion}_WORK`;
          if (!String(root || '').includes(markerNew)) return '';
          return String(root).replace(markerNew, markerOld);
        };
        const guessedOldRoot = trySwap(projectRoot);
        if (guessedOldRoot) pushCodexPlan(guessedOldRoot, projectRoot);
        try {
          const realRoot = fs.realpathSync(projectRoot);
          const guessedOldRealRoot = trySwap(realRoot);
          if (guessedOldRealRoot) pushCodexPlan(guessedOldRealRoot, realRoot);
          if (guessedOldRoot) pushCodexPlan(guessedOldRoot, realRoot);
          if (guessedOldRealRoot) pushCodexPlan(guessedOldRealRoot, projectRoot);
        } catch {
          // Ignore realpath errors.
        }
      }

      const seenPlans = new Set();
      const aggregate = { scanned: 0, updated: 0, files: [] };
      for (const plan of codexPlans) {
        const key = `${plan.from}=>${plan.to}`;
        if (seenPlans.has(key)) continue;
        seenPlans.add(key);
        const migrated = utils.rewriteCodexSessionPaths(plan.from, plan.to);
        aggregate.scanned += migrated.scanned;
        aggregate.updated += migrated.updated;
        for (const f of migrated.files || []) {
          if (!aggregate.files.includes(f)) aggregate.files.push(f);
        }
      }

      if (aggregate.updated > 0) {
        for (const f of aggregate.files) {
          const msg = `Codex-session path-migrated ${f}`;
          results.updated.push(msg);
          console.log(`[Version Manager] [OK] ${msg}`);
        }
      }
      console.log(
        `[Version Manager] Codex session migration scan complete: ` +
        `${aggregate.updated}/${aggregate.scanned} files updated`
      );
    } catch (err) {
      results.failed.push({ file: 'Codex session migration', error: err.message });
      console.error(`[Version Manager] [FAIL] Codex session migration: ${err.message}`);
    }
    
    // ========================================================================
    // 8. Persist branding metadata (website/company/product/security)
    // ========================================================================
    try {
      if (brandingMetadata && typeof brandingMetadata === 'object') {
        const saved = writeBrandingMetadata(fromPath, normalizedBranding);
        const rel = path.relative(projectRoot, saved.path);
        results.updated.push(`Updated ${rel}`);
        console.log(`[Version Manager] [OK] Updated ${rel}`);
      }
    } catch (err) {
      results.failed.push({ file: 'Branding metadata', error: err.message });
      console.error(`[Version Manager] [FAIL] Branding metadata: ${err.message}`);
    }

    // ========================================================================
    // Summary
    // ========================================================================
    try {
      const generatedPaths = filePathsGenerator.generateFilePathsDoc(
        projectRoot,
        newVersion,
        dateFormatted
      );
      if (generatedPaths?.success) {
        const generatedRel = path.relative(projectRoot, generatedPaths.filePath);
        results.updated.push(`Generated ${generatedRel}`);
        console.log(`[Version Manager] [OK] Generated ${generatedRel}`);
      }
    } catch (err) {
      results.failed.push({ file: 'FilePaths auto-generation', error: err.message });
      console.error(`[Version Manager] [FAIL] FilePaths auto-generation: ${err.message}`);
    }

    try {
      const generated = projectFilesGenerator.generateProjectFilesDoc(
        projectRoot,
        newVersion,
        dateFormatted,
        effectiveCopyrightYear
      );
      if (generated?.success) {
        const generatedRel = path.relative(projectRoot, generated.filePath);
        results.updated.push(`Generated ${generatedRel}`);
        console.log(`[Version Manager] [OK] Generated ${generatedRel}`);
      }
    } catch (err) {
      results.failed.push({ file: 'ProjectFiles auto-generation', error: err.message });
      console.error(`[Version Manager] [FAIL] ProjectFiles auto-generation: ${err.message}`);
    }

    // Ensure package.json version is always updated as canonical source-of-truth.
    try {
      const packageResult = forceUpdatePackageVersion(fromPath, newVersion);
      if (packageResult.updated) {
        results.updated.push('launcher/package.json (forced source-of-truth sync)');
        console.log('[Version Manager] [OK] launcher/package.json (forced source-of-truth sync)');
      }
    } catch (err) {
      results.failed.push({ file: 'launcher/package.json', error: err.message });
      console.error(`[Version Manager] [FAIL] package.json force sync: ${err.message}`);
    }

    console.log(`[Version Manager] ========================================`);
    const summary = `Updated ${results.updated.length} files, ${results.failed.length} failed, ${results.skipped.length} skipped`;
    console.log(`[Version Manager] ${summary}`);
    console.log(`[Version Manager] ========================================`);
    
    if (results.failed.length > 0) {
      console.warn('[Version Manager] Failed files:', results.failed);
    }
    
    return {
      success: results.failed.length === 0,
      updated: results.updated,
      failed: results.failed,
      skipped: results.skipped,
      message: summary,
      renamePlan
    };
    
  } catch (err) {
    console.error('[Version Manager] Critical error during version update:', err);
    return { 
      success: false, 
      message: err.message,
      updated: [],
      failed: [],
      skipped: []
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  getCurrentVersion,
  updateVersion,
  getVersionStatus,
  createLightweightProjectClone,
  getComplianceEvidenceStatus,
  saveComplianceEvidence,
  addComplianceTrustedKey,
  removeComplianceTrustedKey,
  signComplianceEvidence
};
