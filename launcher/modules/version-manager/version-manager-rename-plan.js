/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
'use strict';

const path = require('path');

function buildWorkspaceRenamePlan(projectRoot, newVersion) {
  try {
    const root = path.resolve(projectRoot);
    const parent = path.dirname(root);
    const currentName = path.basename(root);
    const m = currentName.match(/^PSF_Offline_[0-9]+\.[0-9]+\.[0-9]+[a-z]?_WORK$/i);
    if (!m) {
      return { required: false, reason: 'workspace-name-not-versioned' };
    }
    const targetName = `PSF_Offline_${newVersion}_WORK`;
    const targetPath = path.join(parent, targetName);
    if (targetName === currentName) {
      return { required: false, reason: 'already-matches-version' };
    }
    return {
      required: true,
      from: root,
      to: targetPath,
      fromName: currentName,
      toName: targetName
    };
  } catch {
    return { required: false, reason: 'rename-plan-error' };
  }
}

module.exports = {
  buildWorkspaceRenamePlan
};
