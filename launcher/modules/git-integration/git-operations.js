/**
 * PSF Git Integration - Operations
 * Core git operations using isomorphic-git
 * 
 * @module git-operations
 * @version 1.1.3 - March 5, 2026
 */

const path = require('path');
const fs = require('fs');

// isomorphic-git loaded dynamically
let git = null;

/**
 * Initialize git operations
 */
async function initialize() {
  git = require('isomorphic-git');
  console.log('[Git:Ops] isomorphic-git loaded');
}

/**
 * Check if directory is a git repo
 */
async function isRepo(repoPath) {
  try {
    const gitDir = path.join(repoPath, '.git');
    return fs.existsSync(gitDir);
  } catch {
    return false;
  }
}

/**
 * Get repository status
 */
async function status(repoPath) {
  const statusMatrix = await git.statusMatrix({ fs, dir: repoPath });
  
  const files = {
    staged: [],
    unstaged: [],
    untracked: []
  };
  
  for (const [filepath, head, workdir, stage] of statusMatrix) {
    // Status codes: [HEAD, WORKDIR, STAGE]
    // 0 = absent, 1 = present unchanged, 2 = present modified
    
    if (head === 0 && workdir === 2 && stage === 0) {
      files.untracked.push(filepath);
    } else if (workdir !== stage) {
      files.unstaged.push({ path: filepath, status: getStatusLabel(head, workdir, stage) });
    } else if (head !== stage) {
      files.staged.push({ path: filepath, status: getStatusLabel(head, workdir, stage) });
    }
  }
  
  const branch = await currentBranch(repoPath);
  
  return {
    branch,
    files,
    clean: files.staged.length === 0 && files.unstaged.length === 0 && files.untracked.length === 0
  };
}

/**
 * Get human-readable status label
 */
function getStatusLabel(head, workdir, stage) {
  if (head === 0) return 'added';
  if (workdir === 0) return 'deleted';
  if (head !== workdir) return 'modified';
  return 'unchanged';
}

/**
 * Get diff
 */
async function diff(repoPath, options = {}) {
  const { ref1 = 'HEAD', ref2 = null, filepath = null } = options;
  
  // Get trees to compare
  const commit1 = await git.resolveRef({ fs, dir: repoPath, ref: ref1 });
  const tree1 = await git.readTree({ fs, dir: repoPath, oid: commit1 });
  
  let tree2 = null;
  if (ref2) {
    const commit2 = await git.resolveRef({ fs, dir: repoPath, ref: ref2 });
    tree2 = await git.readTree({ fs, dir: repoPath, oid: commit2 });
  }
  
  // For working directory diff
  const statusMatrix = await git.statusMatrix({ fs, dir: repoPath });
  const changes = [];
  
  for (const [file, head, workdir, stage] of statusMatrix) {
    if (filepath && file !== filepath) continue;
    if (workdir === head && stage === head) continue;
    
    // Get file contents for diff
    let oldContent = '';
    let newContent = '';
    
    if (head !== 0) {
      try {
        const blob = await git.readBlob({
          fs,
          dir: repoPath,
          oid: commit1,
          filepath: file
        });
        oldContent = new TextDecoder().decode(blob.blob);
      } catch {}
    }
    
    if (workdir !== 0) {
      try {
        newContent = fs.readFileSync(path.join(repoPath, file), 'utf8');
      } catch {}
    }
    
    changes.push({
      path: file,
      status: getStatusLabel(head, workdir, stage),
      oldContent: oldContent.substring(0, 10000),  // Truncate
      newContent: newContent.substring(0, 10000)
    });
  }
  
  return { changes };
}

/**
 * Create commit
 */
async function commit(repoPath, message, options = {}) {
  const { author = { name: 'PSF User', email: 'user@psf.local' } } = options;
  
  // Stage all changes if requested
  if (options.all) {
    const statusMatrix = await git.statusMatrix({ fs, dir: repoPath });
    for (const [filepath, head, workdir, stage] of statusMatrix) {
      if (workdir !== stage) {
        if (workdir === 0) {
          await git.remove({ fs, dir: repoPath, filepath });
        } else {
          await git.add({ fs, dir: repoPath, filepath });
        }
      }
    }
  }
  
  const sha = await git.commit({
    fs,
    dir: repoPath,
    message,
    author
  });
  
  return { sha, message };
}

/**
 * Get commit log
 */
async function log(repoPath, options = {}) {
  const { depth = 20, ref = 'HEAD' } = options;
  
  const commits = await git.log({
    fs,
    dir: repoPath,
    depth,
    ref
  });
  
  return commits.map(c => ({
    sha: c.oid,
    message: c.commit.message,
    author: c.commit.author.name,
    email: c.commit.author.email,
    date: new Date(c.commit.author.timestamp * 1000).toISOString()
  }));
}

/**
 * Get blame for file (simplified)
 */
async function blame(repoPath, filepath) {
  // Note: isomorphic-git doesn't have native blame
  // This is a simplified implementation
  const commits = await log(repoPath, { depth: 50 });
  
  // Get current file content
  const fullPath = path.join(repoPath, filepath);
  if (!fs.existsSync(fullPath)) {
    return { error: 'File not found' };
  }
  
  const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
  
  // Return basic info (full blame would require tracking each line through history)
  return {
    filepath,
    totalLines: lines.length,
    lastCommit: commits[0] || null,
    note: 'Full blame requires commit history traversal'
  };
}

/**
 * Clone repository
 */
async function clone(url, destPath, options = {}) {
  const http = require('isomorphic-git/http/node');
  
  await git.clone({
    fs,
    http,
    dir: destPath,
    url,
    depth: options.depth || 1,
    singleBranch: options.singleBranch !== false
  });
  
  return { success: true, path: destPath };
}

/**
 * Get current branch
 */
async function currentBranch(repoPath) {
  try {
    return await git.currentBranch({ fs, dir: repoPath });
  } catch {
    return null;
  }
}

/**
 * List branches
 */
async function listBranches(repoPath) {
  const branches = await git.listBranches({ fs, dir: repoPath });
  return branches;
}

/**
 * Checkout branch or commit
 */
async function checkout(repoPath, ref) {
  await git.checkout({
    fs,
    dir: repoPath,
    ref
  });
  
  return { success: true, ref };
}

module.exports = {
  initialize,
  isRepo,
  status,
  diff,
  commit,
  log,
  blame,
  clone,
  currentBranch,
  listBranches,
  checkout
};
