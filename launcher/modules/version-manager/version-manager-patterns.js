/**
 * Pseudo Science Fiction Core Collection - Version Manager Patterns
 * Version pattern updaters for each file type
 *
 * @module version-manager-patterns
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 * @license SEE LICENSE.txt
 */

const fs = require('fs');
const path = require('path');
const config = require('./version-manager-config');
const {
  updateMarkdownVersion,
  updateHTMLVersion,
  applyBrandingToHTML,
  insertMissingTags,
  isHeaderInsertionExcluded
} = require('./version-manager-patterns-markup');

function updateJSVersion(content, newVersion, dateFormatted, copyrightYear) {
  let modified = false;

  const pattern1 = /(\* @version )\d+\.\d+\.\d+[a-z]?( - [A-Za-z]+ \d+, \d+)?(\s*\([^)]+\))?/g;
  if (pattern1.test(content)) {
    content = content.replace(pattern1, `$1${newVersion} - ${dateFormatted}$3`);
    modified = true;
  }

  const pattern2 = /(\* Version: )\d+\.\d+\.\d+[a-z]?/g;
  if (pattern2.test(content)) {
    content = content.replace(pattern2, `$1${newVersion}`);
    modified = true;
  }

  const pattern3 = /(\/\/ Version: )\d+\.\d+\.\d+[a-z]?/g;
  if (pattern3.test(content)) {
    content = content.replace(pattern3, `$1${newVersion}`);
    modified = true;
  }

  const pattern4 = /(\* Version: )\d+\.\d+\.\d+[a-z]?(\s*\([^)]+\))?/g;
  if (pattern4.test(content)) {
    content = content.replace(pattern4, `$1${newVersion}$2`);
    modified = true;
  }

  if (copyrightYear) {
    const pattern5 = /(\* @copyright )\d{4}/g;
    if (pattern5.test(content)) {
      content = content.replace(pattern5, `$1${copyrightYear}`);
      modified = true;
    }
  }

  return { content, modified };
}

function updateCSSVersion(content, newVersion, dateFormatted, copyrightYear) {
  let modified = false;

  const pattern1 = /(\/\*\s*@version\s*)\d+\.\d+\.\d+[a-z]?(\s*-\s*[^*]+)?(\s*\*\/)/gi;
  if (pattern1.test(content)) {
    content = content.replace(pattern1, `$1${newVersion} - ${dateFormatted}$3`);
    modified = true;
  }

  const pattern2 = /(\/\*\s*Version:\s*)\d+\.\d+\.\d+[a-z]?(\s*\*\/)/gi;
  if (pattern2.test(content)) {
    content = content.replace(pattern2, `$1${newVersion}$2`);
    modified = true;
  }

  if (copyrightYear) {
    const pattern3 = /(\/\*\s*@copyright\s*)\d{4}([^*]*\*\/)/gi;
    if (pattern3.test(content)) {
      content = content.replace(pattern3, `$1${copyrightYear}$2`);
      modified = true;
    }
  }

  return { content, modified };
}

function updateShellVersion(content, newVersion, dateFormatted, copyrightYear) {
  let modified = false;

  const pattern1 = /(#\s*@version\s*)\d+\.\d+\.\d+[a-z]?(\s*-\s*[^\n]+)?/gi;
  if (pattern1.test(content)) {
    content = content.replace(pattern1, `$1${newVersion} - ${dateFormatted}`);
    modified = true;
  }

  const pattern2 = /(#\s*Version:\s*)\d+\.\d+\.\d+[a-z]?/gi;
  if (pattern2.test(content)) {
    content = content.replace(pattern2, `$1${newVersion}`);
    modified = true;
  }

  if (copyrightYear) {
    const pattern3 = /(#\s*@copyright\s*)\d{4}/gi;
    if (pattern3.test(content)) {
      content = content.replace(pattern3, `$1${copyrightYear}`);
      modified = true;
    }
  }

  return { content, modified };
}

function updateBatchVersion(content, newVersion, dateFormatted, copyrightYear) {
  let modified = false;

  const pattern1 = /(REM\s*@version\s*)\d+\.\d+\.\d+[a-z]?(\s*-\s*[^\r\n]+)?/gi;
  if (pattern1.test(content)) {
    content = content.replace(pattern1, `$1${newVersion} - ${dateFormatted}`);
    modified = true;
  }

  const pattern2 = /(REM\s*Version:\s*)\d+\.\d+\.\d+[a-z]?/gi;
  if (pattern2.test(content)) {
    content = content.replace(pattern2, `$1${newVersion}`);
    modified = true;
  }

  if (copyrightYear) {
    const pattern3 = /(REM\s*@copyright\s*)\d{4}/gi;
    if (pattern3.test(content)) {
      content = content.replace(pattern3, `$1${copyrightYear}`);
      modified = true;
    }
  }

  return { content, modified };
}

function updatePythonVersion(content, newVersion, dateFormatted, copyrightYear) {
  let modified = false;

  const pattern1 = /(#\s*@version\s*)\d+\.\d+\.\d+[a-z]?(\s*-\s*[^\n]+)?/gi;
  if (pattern1.test(content)) {
    content = content.replace(pattern1, `$1${newVersion} - ${dateFormatted}`);
    modified = true;
  }

  const pattern2 = /(@version\s*)\d+\.\d+\.\d+[a-z]?/gi;
  if (pattern2.test(content)) {
    content = content.replace(pattern2, `$1${newVersion}`);
    modified = true;
  }

  const pattern3 = /(__version__\s*=\s*["'])\d+\.\d+\.\d+[a-z]?(["'])/g;
  if (pattern3.test(content)) {
    content = content.replace(pattern3, `$1${newVersion}$2`);
    modified = true;
  }

  if (copyrightYear) {
    const pattern4 = /(#\s*@copyright\s*)\d{4}/gi;
    if (pattern4.test(content)) {
      content = content.replace(pattern4, `$1${copyrightYear}`);
      modified = true;
    }
  }

  return { content, modified };
}

function updateJSONVersion(content, newVersion, today) {
  try {
    const data = JSON.parse(content);
    let modified = false;

    if ('version' in data) {
      data.version = newVersion;
      modified = true;
    }

    if ('last_updated' in data) {
      data.last_updated = today;
    }

    if (modified) {
      return { content: JSON.stringify(data, null, 2) + '\n', modified: true };
    }

    return { content, modified: false };
  } catch {
    return { content, modified: false };
  }
}

function updateFileVersion(filePath, newVersion, dateFormatted, today, copyrightYear, previousVersion = null, brandingMetadata = null) {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let result = { content, modified: false };

    switch (ext) {
      case '.js':
        result = updateJSVersion(content, newVersion, dateFormatted, copyrightYear);
        break;
      case '.css':
        result = updateCSSVersion(content, newVersion, dateFormatted, copyrightYear);
        break;
      case '.sh':
        result = updateShellVersion(content, newVersion, dateFormatted, copyrightYear);
        break;
      case '.bat':
        result = updateBatchVersion(content, newVersion, dateFormatted, copyrightYear);
        break;
      case '.py':
        result = updatePythonVersion(content, newVersion, dateFormatted, copyrightYear);
        break;
      case '.md':
        result = updateMarkdownVersion(content, newVersion, dateFormatted, previousVersion);
        break;
      case '.html':
        result = updateHTMLVersion(content, newVersion, dateFormatted, copyrightYear);
        if (brandingMetadata && result.content) {
          const branded = applyBrandingToHTML(result.content, brandingMetadata);
          if (branded.modified) {
            result = { content: branded.content, modified: true };
          }
        }
        break;
      case '.json':
        if (config.VERSIONED_JSON_FILES.includes(fileName) || fileName.startsWith('catalog-sku-')) {
          result = updateJSONVersion(content, newVersion, today);
        }
        break;
    }

    if (!result.modified && ext !== '.json' && !isHeaderInsertionExcluded(filePath)) {
      result = insertMissingTags(content, ext, newVersion, dateFormatted, copyrightYear);
    }

    if (result.modified) {
      fs.writeFileSync(filePath, result.content, 'utf8');
      return true;
    }

    return false;
  } catch (err) {
    console.error(`[Version Manager] Error updating ${filePath}:`, err.message);
    return false;
  }
}

module.exports = {
  updateJSVersion,
  updateCSSVersion,
  updateShellVersion,
  updateBatchVersion,
  updatePythonVersion,
  updateMarkdownVersion,
  updateHTMLVersion,
  updateJSONVersion,
  updateFileVersion
};
