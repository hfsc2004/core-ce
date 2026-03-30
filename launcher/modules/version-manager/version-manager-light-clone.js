/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function shouldExcludeFromLightClone(projectRoot, absPath) {
  const normalizedRoot = path.resolve(projectRoot);
  const target = path.resolve(absPath);
  const rel = path.relative(normalizedRoot, target).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  if (rel === '.git' || rel.startsWith('.git/')) return true;
  if (rel === 'binaries' || rel.startsWith('binaries/')) return true;
  if (rel === 'models') return false;
  if (rel.startsWith('models/')) {
    const rest = rel.slice('models/'.length);
    if (!rest) return false;
    if (rest.includes('/')) return true;
    try {
      if (fs.statSync(target).isDirectory()) return true;
    } catch {
      return true;
    }
    return false;
  }
  if (rel === 'node_modules' || rel.startsWith('node_modules/')) return true;
  if (rel.includes('/node_modules/') || rel.endsWith('/node_modules')) return true;
  if (rel === 'dist' || rel.startsWith('dist/')) return true;
  return false;
}

function createZipArchive(sourceDir, outputZip) {
  const sourceParent = path.dirname(sourceDir);
  const folderName = path.basename(sourceDir);
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    const script = `Compress-Archive -Path "${path.join(sourceDir, '*')}" -DestinationPath "${outputZip}" -Force`;
    const ps = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
      encoding: 'utf8'
    });
    if (ps.status === 0 && fs.existsSync(outputZip)) {
      return { success: true };
    }
    return { success: false, message: (ps.stderr || ps.stdout || 'Compress-Archive failed').trim() };
  }

  const zip = spawnSync('zip', ['-r', outputZip, folderName], {
    cwd: sourceParent,
    encoding: 'utf8'
  });
  if (zip.status === 0 && fs.existsSync(outputZip)) {
    return { success: true };
  }
  return { success: false, message: (zip.stderr || zip.stdout || 'zip command failed').trim() };
}

async function createLightweightProjectClone(fromPath) {
  try {
    const appDir = path.resolve(fromPath);
    const projectRoot = path.resolve(path.join(appDir, '..'));
    const parentDir = path.dirname(projectRoot);
    const currentName = path.basename(projectRoot);
    const cloneName = currentName.replace(/_WORK$/i, '');
    if (!cloneName || cloneName === currentName) {
      return {
        success: false,
        message: `Workspace name "${currentName}" does not end with "_WORK".`
      };
    }

    const cloneDir = path.join(parentDir, cloneName);
    const zipPath = path.join(parentDir, `${cloneName}.zip`);
    if (fs.existsSync(cloneDir)) {
      return { success: false, message: `Clone destination already exists: ${cloneDir}` };
    }
    if (fs.existsSync(zipPath)) {
      return { success: false, message: `Zip already exists: ${zipPath}` };
    }

    let copiedCount = 0;
    fs.cpSync(projectRoot, cloneDir, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      filter: (src) => {
        const exclude = shouldExcludeFromLightClone(projectRoot, src);
        if (!exclude && src !== projectRoot) {
          try {
            if (fs.statSync(src).isFile()) copiedCount += 1;
          } catch {
            // ignore count failures
          }
        }
        return !exclude;
      }
    });

    const zipped = createZipArchive(cloneDir, zipPath);
    if (!zipped.success) {
      return {
        success: false,
        message: `Clone created but zip failed: ${zipped.message}`,
        cloneDir
      };
    }

    const zipStat = fs.statSync(zipPath);
    const zipSizeMB = (zipStat.size / (1024 * 1024)).toFixed(2);
    return {
      success: true,
      message: 'Lightweight clone created and zipped successfully.',
      cloneDir,
      zipPath,
      copiedFiles: copiedCount,
      zipSizeMB
    };
  } catch (err) {
    return { success: false, message: err.message || String(err) };
  }
}

module.exports = {
  shouldExcludeFromLightClone,
  createZipArchive,
  createLightweightProjectClone
};
