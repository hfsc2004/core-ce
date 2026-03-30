/**
 * PSF Git Integration - Context Extraction
 * Extract git context for RAG augmentation
 * 
 * @module git-context
 * @version 1.1.3 - March 5, 2026
 */

const gitOperations = require('./git-operations');

/**
 * Extract git context for RAG
 * @param {string} repoPath - Repository path
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} Context object for embedding
 */
async function extract(repoPath, options = {}) {
  const { depth = 10, includeStatus = true, includeDiff = true } = options;
  
  const context = {
    repoPath,
    branch: null,
    recentCommits: [],
    status: null,
    modifiedFiles: [],
    summary: ''
  };
  
  try {
    // Get current branch
    context.branch = await gitOperations.currentBranch(repoPath);
    
    // Get recent commits
    const commits = await gitOperations.log(repoPath, { depth });
    context.recentCommits = commits.map(c => ({
      sha: c.sha.substring(0, 7),
      message: c.message.split('\n')[0],  // First line only
      author: c.author,
      date: c.date
    }));
    
    // Get current status
    if (includeStatus) {
      context.status = await gitOperations.status(repoPath);
      context.modifiedFiles = [
        ...context.status.files.staged.map(f => f.path || f),
        ...context.status.files.unstaged.map(f => f.path || f),
        ...context.status.files.untracked
      ];
    }
    
    // Build summary for embedding
    context.summary = buildContextSummary(context);
    
    return context;
  } catch (err) {
    console.error('[Git:Context] Extraction error:', err);
    return { error: err.message };
  }
}

/**
 * Build human-readable context summary
 */
function buildContextSummary(context) {
  const lines = [];
  
  lines.push(`Repository branch: ${context.branch || 'unknown'}`);
  
  if (context.recentCommits.length > 0) {
    lines.push('\nRecent commits:');
    for (const commit of context.recentCommits.slice(0, 5)) {
      lines.push(`- ${commit.sha}: ${commit.message} (${commit.author})`);
    }
  }
  
  if (context.modifiedFiles.length > 0) {
    lines.push('\nModified files:');
    for (const file of context.modifiedFiles.slice(0, 10)) {
      lines.push(`- ${file}`);
    }
    if (context.modifiedFiles.length > 10) {
      lines.push(`... and ${context.modifiedFiles.length - 10} more`);
    }
  } else if (context.status?.clean) {
    lines.push('\nWorking directory is clean.');
  }
  
  return lines.join('\n');
}

/**
 * Get commit context for a specific file
 * @param {string} repoPath - Repository path
 * @param {string} filepath - File path
 * @param {Object} options - Options
 * @returns {Promise<Object>} File-specific context
 */
async function extractFileContext(repoPath, filepath, options = {}) {
  const { depth = 5 } = options;
  
  const context = {
    filepath,
    commits: [],
    lastModified: null
  };
  
  try {
    // Get all commits and filter by file
    // Note: isomorphic-git doesn't have --follow, so this is simplified
    const allCommits = await gitOperations.log(repoPath, { depth: depth * 3 });
    
    // Would need to check each commit for file changes
    // For now, return recent commits as approximate context
    context.commits = allCommits.slice(0, depth);
    context.lastModified = context.commits[0]?.date || null;
    
    return context;
  } catch (err) {
    console.error('[Git:Context] File context error:', err);
    return { error: err.message };
  }
}

/**
 * Format context for prompt injection
 * @param {Object} context - Context from extract()
 * @returns {string} Formatted context string
 */
function formatForPrompt(context) {
  if (context.error) {
    return `[Git context unavailable: ${context.error}]`;
  }
  
  return `
<git_context>
Branch: ${context.branch || 'unknown'}
${context.status?.clean ? 'Working directory clean' : `Modified files: ${context.modifiedFiles.length}`}

Recent activity:
${context.recentCommits.slice(0, 3).map(c => `- ${c.message}`).join('\n')}
</git_context>
`.trim();
}

module.exports = {
  extract,
  extractFileContext,
  formatForPrompt
};
