'use strict';
const CAPABILITY = Object.freeze({ id:'scaled-delta-sign', version:'1' });
function validate(mapping) {
  if (mapping?.id !== CAPABILITY.id || mapping.version !== CAPABILITY.version ||
      !mapping.parameters || Object.keys(mapping.parameters).length !== 1 ||
      typeof mapping.parameters.scale !== 'number' || !Number.isFinite(mapping.parameters.scale)) throw new Error('scaled-delta-sign v1 requires exactly one finite scale parameter');
}
function map(delta,mapping) {
  validate(mapping);
  if (typeof delta !== 'number' || !Number.isFinite(delta)) throw new Error('Finite recurrent-state delta required');
  const signal = delta*mapping.parameters.scale;
  if (!Number.isFinite(signal)) throw new Error('Mapped delta overflow');
  return { signal, direction:signal > 0 ? 'positive' : signal < 0 ? 'negative' : 'zero' };
}
module.exports = { CAPABILITY, validate, map };
