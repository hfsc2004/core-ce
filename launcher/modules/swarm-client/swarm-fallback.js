/**
 * PSF Swarm Client - Fallback Behavior (stub)
 *
 * @module swarm-fallback
 * @version 1.1.3 - March 5, 2026
 */

function onSwarmUnavailable(task = {}, options = {}) {
  const strategy = String(options.strategy || 'local').toLowerCase();
  if (strategy === 'error') {
    return { fallback: false, error: 'swarm_unavailable' };
  }
  return {
    fallback: true,
    route: 'local',
    reason: 'swarm_unavailable_local_fallback',
    taskType: task?.type || 'unknown'
  };
}

module.exports = {
  onSwarmUnavailable
};
