/**
 * PSF Swarm Client - Routing Policy (stub)
 *
 * @module swarm-routing
 * @version 1.1.3 - March 5, 2026
 */

function chooseRoute(task = {}, policy = {}) {
  const p = String(policy.mode || 'prefer-local').toLowerCase();
  if (p === 'force-swarm') return { route: 'swarm', reason: 'policy_force_swarm' };
  if (p === 'force-local') return { route: 'local', reason: 'policy_force_local' };

  if (task?.requiresCluster === true) {
    return { route: 'swarm', reason: 'task_requires_cluster' };
  }
  return { route: 'local', reason: 'prefer_local_default' };
}

module.exports = {
  chooseRoute
};
