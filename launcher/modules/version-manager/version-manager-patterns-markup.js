/**
 * Version Manager patterns for Markdown/HTML and header insertion.
 */

const config = require('./version-manager-config');

function updateMarkdownVersion(content, newVersion, dateFormatted, previousVersion = null) {
  let modified = false;

  const pattern1 = /(@version\s*)\d+\.\d+\.\d+[a-z]?(\s*-\s*[^\n]+)?/gi;
  if (pattern1.test(content)) {
    content = content.replace(pattern1, `$1${newVersion} - ${dateFormatted}`);
    modified = true;
  }

  const pattern2 = /(\*\*Version:\*\*\s*)\d+\.\d+\.\d+[a-z]?/gi;
  if (pattern2.test(content)) {
    content = content.replace(pattern2, `$1${newVersion}`);
    modified = true;
  }

  const pattern3 = /(^Version:\s*)\d+\.\d+\.\d+[a-z]?/gim;
  if (pattern3.test(content)) {
    content = content.replace(pattern3, `$1${newVersion}`);
    modified = true;
  }

  const pattern3b = /(\*Version:\s*)\d+\.\d+\.\d+[a-z]?(\*)/gim;
  if (pattern3b.test(content)) {
    content = content.replace(pattern3b, `$1${newVersion}$2`);
    modified = true;
  }

  const pattern4 = /(^#{1,6}\s*Version\s+)\d+\.\d+\.\d+[a-z]?/gim;
  if (pattern4.test(content)) {
    content = content.replace(pattern4, `$1${newVersion}`);
    modified = true;
  }

  const pattern5 = /(^#{1,6}[^\n]*\()v?\d+\.\d+\.\d+[a-z]?(\))/gim;
  if (pattern5.test(content)) {
    content = content.replace(pattern5, (match, prefix, suffix) => {
      const hasV = /\(v\d+\.\d+\.\d+[a-z]?\)/i.test(match);
      return `${prefix}${hasV ? 'v' : ''}${newVersion}${suffix}`;
    });
    modified = true;
  }

  const pattern6 = /(^#{1,6}\s*Release\s+Notes\s*-\s*)\d+\.\d+\.\d+[a-z]?/gim;
  if (pattern6.test(content)) {
    content = content.replace(pattern6, `$1${newVersion}`);
    modified = true;
  }

  const fromDot = String(previousVersion || '').trim();
  const fromUnderscore = fromDot ? fromDot.replace(/\./g, '_') : '';
  const toUnderscore = newVersion.replace(/\./g, '_');
  const versionedDocPrefixes = '(' +
    'FilePaths_|ProjectFiles_|PSF_Pipeline_Trace_|CompileProduct_Pipeline_|Cluster_Pipeline_Stubs_|' +
    'Deterministic_Tooling_Layer_|EditionSecurityPolicy_|MoE_IRG_Gateway_USB_Serial_|' +
    'RLM_Assisted_PSF_Terminal_|SecurityRoadmap_' +
  ')';

  const replaceVersionedDocRefs = (input) => {
    let output = input;
    if (fromDot) {
      const rxFromDot = new RegExp(`${versionedDocPrefixes}${fromDot}\\.md`, 'g');
      output = output.replace(rxFromDot, (m, p1) => `${p1}${toUnderscore}.md`);
    }
    if (fromUnderscore) {
      const rxFromUnderscore = new RegExp(`${versionedDocPrefixes}${fromUnderscore}\\.md`, 'g');
      output = output.replace(rxFromUnderscore, (m, p1) => `${p1}${toUnderscore}.md`);
    }
    const rxAnyDot = new RegExp(`${versionedDocPrefixes}\\d+\\.\\d+\\.\\d+[a-z]?\\.md`, 'g');
    output = output.replace(rxAnyDot, (m, p1) => `${p1}${toUnderscore}.md`);
    const rxAnyUnderscore = new RegExp(`${versionedDocPrefixes}\\d+_\\d+_\\d+[a-z]?\\.md`, 'g');
    output = output.replace(rxAnyUnderscore, (m, p1) => `${p1}${toUnderscore}.md`);
    return output;
  };

  const rewrittenDocRefs = replaceVersionedDocRefs(content);
  if (rewrittenDocRefs !== content) {
    content = rewrittenDocRefs;
    modified = true;
  }

  return { content, modified };
}

function updateHTMLVersion(content, newVersion, dateFormatted, copyrightYear) {
  let modified = false;

  const pattern1 = /(<p>Version\s*)\d+\.\d+\.\d+[a-z]?(<\/p>)/gi;
  if (pattern1.test(content)) {
    content = content.replace(pattern1, `$1${newVersion}$2`);
    modified = true;
  }

  const pattern2 = /(Edition v)\d+\.\d+\.\d+[a-z]?/gi;
  if (pattern2.test(content)) {
    content = content.replace(pattern2, `$1${newVersion}`);
    modified = true;
  }

  const pattern3 = /(<!--\s*Version:\s*)\d+\.\d+\.\d+[a-z]?(\s*-->)/gi;
  if (pattern3.test(content)) {
    content = content.replace(pattern3, `$1${newVersion}$2`);
    modified = true;
  }

  const pattern4 = /(version\s*=\s*["'])\d+\.\d+\.\d+[a-z]?(["'])/gi;
  if (pattern4.test(content)) {
    content = content.replace(pattern4, `$1${newVersion}$2`);
    modified = true;
  }

  if (copyrightYear) {
    const pattern5 = /(Copyright\s*©\s*)\d{4}/gi;
    if (pattern5.test(content)) {
      content = content.replace(pattern5, `$1${copyrightYear}`);
      modified = true;
    }
  }

  return { content, modified };
}

function applyBrandingToHTML(content, brandingMetadata = null) {
  if (!brandingMetadata || typeof brandingMetadata !== 'object') {
    return { content, modified: false };
  }
  let out = content;
  let modified = false;
  const company = String(brandingMetadata.companyName || '').trim();
  const product = String(brandingMetadata.productName || '').trim();
  const website = String(brandingMetadata.website || '').trim();
  const security = String(brandingMetadata.securityTag || '').trim();

  if (company) {
    const patternCompany = /(<(?:a|span)[^>]*id="(?:footer-company-name|settings-about-company-name)"[^>]*>)[\s\S]*?(<\/(?:a|span)>)/gi;
    if (patternCompany.test(out)) {
      out = out.replace(patternCompany, `$1${company}$2`);
      modified = true;
    }
  }

  if (product) {
    const patternProduct = /(<(?:h3|span)[^>]*id="(?:about-product-name|settings-about-product-name|footer-product-name)"[^>]*>)[\s\S]*?(<\/(?:h3|span)>)/gi;
    if (patternProduct.test(out)) {
      out = out.replace(patternProduct, `$1${product}$2`);
      modified = true;
    }
  }

  if (website) {
    const patternHref = /(<a[^>]*id="(?:about-website-link|settings-about-website-link|footer-company-link|settings-about-company-link)"[^>]*href=")[^"]*(")/gi;
    if (patternHref.test(out)) {
      out = out.replace(patternHref, `$1${website}$2`);
      modified = true;
    }
  }

  if (security) {
    const patternSecurity = /(<span[^>]*id="(?:footer-security-tag|settings-about-security-tag)"[^>]*>)[\s\S]*?(<\/span>)/gi;
    if (patternSecurity.test(out)) {
      out = out.replace(patternSecurity, `$1${security}$2`);
      modified = true;
    }
  }

  return { content: out, modified };
}

function insertAfterShebang(content, block) {
  if (content.startsWith('#!')) {
    const newlineIndex = content.indexOf('\n');
    if (newlineIndex >= 0) {
      return `${content.slice(0, newlineIndex + 1)}${block}${content.slice(newlineIndex + 1)}`;
    }
  }
  return `${block}${content}`;
}

function insertMissingTags(content, ext, newVersion, dateFormatted, copyrightYear) {
  const year = Number(copyrightYear) || new Date().getFullYear();
  const hasVersion = /@version\s+\d+\.\d+\.\d+[a-z]?|Version:\s*\d+\.\d+\.\d+[a-z]?|Edition v\d+\.\d+\.\d+[a-z]?/i.test(content);
  const hasCopyright = /@copyright\s+\d{4}|Copyright\s*©\s*\d{4}/i.test(content);
  if (hasVersion && hasCopyright) {
    return { content, modified: false };
  }

  const blockByExt = {
    '.js': ['/**', ' *', ` * @version ${newVersion} - ${dateFormatted}`, ` * @copyright ${year} Pseudo SF`, ' */', ''].join('\n'),
    '.css': [`/* @version ${newVersion} - ${dateFormatted}*/`, `/* @copyright ${year} Pseudo SF*/`, ''].join('\n'),
    '.py': [`# @version ${newVersion} - ${dateFormatted}`, `# @copyright ${year} Pseudo SF`, ''].join('\n'),
    '.sh': [`# @version ${newVersion} - ${dateFormatted}`, `# @copyright ${year} Pseudo SF`, ''].join('\n'),
    '.bat': [`REM @version ${newVersion} - ${dateFormatted}`, `REM @copyright ${year} Pseudo SF`, ''].join('\n'),
    '.html': [`<!-- Version: ${newVersion} -->`, `<!-- Copyright © ${year} Pseudo SF -->`, ''].join('\n'),
    '.md': [`*Version: ${newVersion}*`, `*Copyright © ${year} Pseudo SF*`, ''].join('\n')
  };

  const block = blockByExt[ext];
  if (!block) return { content, modified: false };

  if (ext === '.py' || ext === '.sh') {
    return { content: insertAfterShebang(content, block), modified: true };
  }

  if (ext === '.html') {
    const doctypeMatch = content.match(/^<!DOCTYPE[^>]*>\s*\n/i);
    if (doctypeMatch) {
      const idx = doctypeMatch[0].length;
      return { content: `${content.slice(0, idx)}${block}${content.slice(idx)}`, modified: true };
    }
  }

  return { content: `${block}${content}`, modified: true };
}

function isHeaderInsertionExcluded(filePath) {
  const patterns = Array.isArray(config.HEADER_INSERT_EXCLUDE_PATH_PATTERNS)
    ? config.HEADER_INSERT_EXCLUDE_PATH_PATTERNS
    : [];
  for (const pattern of patterns) {
    try {
      if (pattern && pattern.test && pattern.test(filePath)) {
        return true;
      }
    } catch {
      // Ignore malformed pattern entries.
    }
  }
  return false;
}

module.exports = {
  updateMarkdownVersion,
  updateHTMLVersion,
  applyBrandingToHTML,
  insertMissingTags,
  isHeaderInsertionExcluded
};
