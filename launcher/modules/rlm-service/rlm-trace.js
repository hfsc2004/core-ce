/**
 * RLM trace helpers.
 */

function createRlmTrace(options = {}) {
  const maxRecords = Math.max(10, Number(options.maxRecords) || 500);
  const records = [];

  function add(type, details = {}) {
    const record = {
      ts: new Date().toISOString(),
      type: String(type || 'event'),
      details: details && typeof details === 'object' ? { ...details } : {}
    };
    records.push(record);
    if (records.length > maxRecords) records.splice(0, records.length - maxRecords);
    return record;
  }

  function list(limit = maxRecords) {
    const count = Math.max(1, Math.min(maxRecords, Number(limit) || maxRecords));
    return records.slice(-count).map((record) => ({
      ts: record.ts,
      type: record.type,
      details: { ...(record.details || {}) }
    }));
  }

  return { add, list };
}

module.exports = { createRlmTrace };
