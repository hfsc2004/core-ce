/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

function resolveVersionsPath(fromPath) {
  const projectRoot = path.join(fromPath, '..');
  return path.join(projectRoot, 'models', 'binary-versions.json');
}

async function getBinaryVersions(fromPath) {
  try {
    const configPath = resolveVersionsPath(fromPath);
    const data = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[Binary Manager] Error reading binary versions:', err);
    return null;
  }
}

async function updateBinaryVersion(fromPath, binaryType, newVersion) {
  try {
    const configPath = resolveVersionsPath(fromPath);
    const data = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(data);

    if (!config[binaryType]) {
      return { success: false, message: `Unknown binary type: ${binaryType}` };
    }

    config[binaryType].version = newVersion;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return { success: true, message: `Updated ${binaryType} to ${newVersion}` };
  } catch (err) {
    console.error('[Binary Manager] Error updating binary version:', err);
    return { success: false, message: err.message };
  }
}

async function checkForBinaryUpdates(fromPath, binaryType) {
  try {
    const configPath = resolveVersionsPath(fromPath);
    const data = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(data);

    if (!config[binaryType] || !config[binaryType].apiUrl) {
      return { success: false, message: 'No API URL configured for this binary' };
    }

    const apiUrl = config[binaryType].apiUrl;

    return await new Promise((resolve) => {
      https.get(apiUrl, {
        headers: { 'User-Agent': 'PSF-Robotics-Archive' }
      }, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const release = JSON.parse(responseData);
            const latestVersion = release.tag_name;
            const currentVersion = config[binaryType].version;

            resolve({
              success: true,
              current: currentVersion,
              latest: latestVersion,
              updateAvailable: latestVersion !== currentVersion,
              releaseUrl: release.html_url,
              publishedAt: release.published_at
            });
          } catch {
            resolve({ success: false, message: 'Failed to parse GitHub API response' });
          }
        });
      }).on('error', (err) => {
        resolve({ success: false, message: err.message });
      });
    });
  } catch (err) {
    console.error('[Binary Manager] Error checking for updates:', err);
    return { success: false, message: err.message };
  }
}

module.exports = {
  getBinaryVersions,
  updateBinaryVersion,
  checkForBinaryUpdates
};
