/**
 * Pseudo Science Fiction Core Collection - Project Files Document Generator
 * Builds ProjectFiles_<version>.md from current repository state.
 *
 * @module project-files-generator
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 * @license SEE LICENSE.txt
 */

const fs = require('fs');
const path = require('path');

function toUnderscoreVersion(version) {
  return String(version || '').replace(/\./g, '_');
}

function isIgnoredName(name) {
  return name.startsWith('.');
}

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function firstCommentSummaryFromJs(content) {
  if (!content) return '';
  const block = content.match(/\/\*\*([\s\S]*?)\*\//);
  if (!block) return '';
  const lines = block[1]
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith('@'))
    .filter((l) => !/^=+$/.test(l))
    .filter((l) => !/^[-*]{3,}$/.test(l));
  if (lines.length === 0) return '';
  return lines[0];
}

function describePath(relativePath, absolutePath) {
  const fileName = path.basename(relativePath);
  const ext = path.extname(fileName).toLowerCase();

  if (fileName === 'main.js') return 'Electron main process entrypoint';
  if (fileName === 'preload.js') return 'Renderer context bridge API surface';
  if (fileName === 'preload-standard.js') return 'Standard edition renderer bridge';
  if (fileName === 'package.json') return 'NPM package configuration and dependencies';
  if (fileName === 'start.sh') return 'Primary Linux launcher script';
  if (fileName === 'start.command') return 'Primary macOS launcher script';
  if (fileName === 'start.bat') return 'Primary Windows launcher script';
  if (fileName === 'RUN_ONCE_MAC_LINUX.sh') return 'First-run dependency installer for macOS/Linux';
  if (fileName === 'RUN_ONCE_WINDOWS.bat') return 'First-run dependency installer for Windows';

  if (ext === '.js') {
    if (/-common\.js$/i.test(fileName)) return 'Shared/common utilities';
    if (/(linux|windows|macos)-(x64|arm64|intel|arm)\.js$/i.test(fileName)) return 'Platform-specific implementation';
    if (/^.*-manager\.js$/i.test(fileName)) return 'Module dispatcher/entrypoint';
    const summary = firstCommentSummaryFromJs(readTextSafe(absolutePath));
    if (summary) return summary;
    return 'JavaScript module';
  }

  if (ext === '.json') return 'JSON configuration or data file';
  if (ext === '.md') return 'Project documentation';
  if (ext === '.sh' || ext === '.bat' || ext === '.command') return 'Shell/bootstrap script';
  if (ext === '.html') return 'HTML UI/template file';
  if (ext === '.css') return 'Stylesheet';

  return 'Project file';
}

function table(rows) {
  const out = ['| File | Description |', '|------|-------------|'];
  for (const row of rows) out.push(`| \`${row.file}\` | ${row.description} |`);
  return out.join('\n');
}

function listFilesInDir(baseDir, relativeDir = '') {
  const full = relativeDir ? path.join(baseDir, relativeDir) : baseDir;
  if (!fs.existsSync(full)) return [];
  const entries = fs.readdirSync(full, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && !isIgnoredName(e.name))
    .map((e) => {
      const rel = relativeDir ? path.join(relativeDir, e.name) : e.name;
      const normalized = rel.replace(/\\/g, '/');
      return {
        file: normalized,
        absolute: path.join(baseDir, rel),
        description: describePath(normalized, path.join(baseDir, rel))
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

function generateProjectFilesDoc(projectRoot, newVersion, dateFormatted, copyrightYear) {
  const versionUnderscore = toUnderscoreVersion(newVersion);
  const projectFileName = `ProjectFiles_${versionUnderscore}.md`;
  const projectFilePath = path.join(projectRoot, projectFileName);
  const filePathsName = `FilePaths_${versionUnderscore}.md`;

  const rootRows = listFilesInDir(projectRoot).filter((r) => r.file !== projectFileName);
  const launcherRoot = path.join(projectRoot, 'launcher');
  const launcherRows = listFilesInDir(launcherRoot);

  const modulesRoot = path.join(launcherRoot, 'modules');
  const moduleSections = [];
  if (fs.existsSync(modulesRoot)) {
    const moduleDirs = fs.readdirSync(modulesRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !isIgnoredName(d.name))
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b));
    for (const moduleDir of moduleDirs) {
      const rows = listFilesInDir(modulesRoot, moduleDir).filter((r) => path.extname(r.file) === '.js');
      if (rows.length > 0) {
        moduleSections.push({ title: moduleDir, rows });
      }
    }
  }

  const lines = [
    '/**',
    ' * Pseudo Science Fiction Core Collection - Project Files Documentation',
    ` * Companion file: ${filePathsName} for directory structure`,
    ` * @version ${newVersion} - ${dateFormatted}`,
    ` * @copyright ${copyrightYear}`,
    ' */',
    '',
    '# Pseudo Science Fiction Core Collection - File Descriptions',
    '',
    '> This file is auto-generated by Version Manager during Update Version.',
    '',
    '## Project Root Files',
    '',
    table(rootRows),
    '',
    '## launcher Root Files',
    '',
    table(launcherRows)
  ];

  for (const section of moduleSections) {
    lines.push('', `## Modules/${section.title}`, '', table(section.rows));
  }

  lines.push('', '---', '', `*Version: ${newVersion}*`);

  fs.writeFileSync(projectFilePath, `${lines.join('\n')}\n`, 'utf8');
  return { success: true, fileName: projectFileName, filePath: projectFilePath };
}

module.exports = {
  generateProjectFilesDoc
};

