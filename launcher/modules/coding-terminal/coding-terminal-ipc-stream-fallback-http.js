/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
function createStreamFallbackHttpTools(deps = {}) {
  const {
    http,
    keepAlive = '30m',
    sanitizeAssistantText
  } = deps;

  function requestNonStreamFallback({ modelName, messages, generationOptions, port }) {
    return new Promise((resolve) => {
      const body = {
        model: modelName,
        messages,
        stream: false,
        keep_alive: keepAlive
      };
      if (generationOptions && typeof generationOptions === 'object' && Object.keys(generationOptions).length > 0) {
        body.options = { ...generationOptions };
      }
      const payload = JSON.stringify(body);
      const req = http.request({
        hostname: 'localhost',
        port,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let data = '';
        const statusCode = res.statusCode;
        res.on('data', (chunk) => { data += chunk.toString(); });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data || '{}');
            if (parsed?.error) {
              resolve({ success: false, error: `Ollama error (${modelName} @ ${port}): ${parsed.error}` });
              return;
            }
            const text = sanitizeAssistantText(
              parsed?.message?.content ||
              parsed?.message?.reasoning ||
              parsed?.message?.reasoning_content ||
              parsed?.message?.thinking ||
              parsed?.response?.message?.content ||
              parsed?.response?.message?.reasoning ||
              parsed?.response?.message?.reasoning_content ||
              parsed?.response?.message?.thinking ||
              parsed?.response?.content ||
              parsed?.content ||
              ''
            );
            if (!text) {
              const keys = Object.keys(parsed || {}).slice(0, 12).join(',');
              const preview = String(data || '').replace(/\s+/g, ' ').slice(0, 280);
              resolve({
                success: false,
                error:
                  `No assistant content returned from Ollama (${modelName} @ ${port}). ` +
                  `HTTP ${statusCode || 'n/a'}, keys=[${keys || 'none'}], body=${preview || '<empty>'}`
              });
              return;
            }
            resolve({ success: true, text });
          } catch {
            const preview = String(data || '').replace(/\s+/g, ' ').slice(0, 280);
            resolve({
              success: false,
              error:
                `Failed to parse non-stream fallback response (${modelName} @ ${port}). ` +
                `HTTP ${statusCode || 'n/a'}, body=${preview || '<empty>'}`
            });
          }
        });
      });
      req.on('error', (err) => resolve({ success: false, error: `Ollama fallback error: ${err.message}` }));
      req.setTimeout(120000, () => req.destroy(new Error('Ollama non-stream fallback timeout')));
      req.write(payload);
      req.end();
    });
  }

  function requestGenerateFallback({ modelName, messages, generationOptions, port }) {
    return new Promise((resolve) => {
      const prompt = compilePromptFromMessages(messages);
      const body = {
        model: modelName,
        prompt,
        stream: false,
        keep_alive: keepAlive
      };
      if (generationOptions && typeof generationOptions === 'object' && Object.keys(generationOptions).length > 0) {
        body.options = { ...generationOptions };
      }
      const payload = JSON.stringify(body);
      const req = http.request({
        hostname: 'localhost',
        port,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let data = '';
        const statusCode = res.statusCode;
        res.on('data', (chunk) => { data += chunk.toString(); });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data || '{}');
            if (parsed?.error) {
              resolve({ success: false, error: `Ollama generate error (${modelName} @ ${port}): ${parsed.error}` });
              return;
            }
            const text = sanitizeAssistantText(
              parsed?.response ||
              parsed?.message?.content ||
              parsed?.content ||
              ''
            );
            if (!text) {
              const keys = Object.keys(parsed || {}).slice(0, 12).join(',');
              const preview = String(data || '').replace(/\s+/g, ' ').slice(0, 280);
              resolve({
                success: false,
                error:
                  `No assistant content from Ollama generate (${modelName} @ ${port}). ` +
                  `HTTP ${statusCode || 'n/a'}, keys=[${keys || 'none'}], body=${preview || '<empty>'}`
              });
              return;
            }
            resolve({ success: true, text });
          } catch {
            const preview = String(data || '').replace(/\s+/g, ' ').slice(0, 280);
            resolve({
              success: false,
              error:
                `Failed to parse Ollama generate fallback (${modelName} @ ${port}). ` +
                `HTTP ${statusCode || 'n/a'}, body=${preview || '<empty>'}`
            });
          }
        });
      });
      req.on('error', (err) => resolve({ success: false, error: `Ollama generate fallback error: ${err.message}` }));
      req.setTimeout(120000, () => req.destroy(new Error('Ollama generate fallback timeout')));
      req.write(payload);
      req.end();
    });
  }

  function requestLlamaNonStream({ modelName, messages, generationOptions, port }) {
    return new Promise((resolve) => {
      const body = {
        model: modelName || 'local-model',
        messages: Array.isArray(messages) ? messages : [],
        stream: false
      };
      if (generationOptions && typeof generationOptions === 'object') {
        if (generationOptions.temperature !== undefined) body.temperature = generationOptions.temperature;
        if (generationOptions.top_p !== undefined) body.top_p = generationOptions.top_p;
        if (generationOptions.num_predict !== undefined) body.max_tokens = generationOptions.num_predict;
        if (generationOptions.stop !== undefined) body.stop = generationOptions.stop;
      }
      const payload = JSON.stringify(body);
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let data = '';
        const statusCode = res.statusCode;
        res.on('data', (chunk) => { data += chunk.toString(); });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data || '{}');
            const text = sanitizeAssistantText(
              parsed?.choices?.[0]?.message?.content ||
              parsed?.choices?.[0]?.delta?.content ||
              ''
            );
            if (!text) {
              resolve({
                success: false,
                error: `No assistant content from llama.cpp (${modelName} @ ${port}). HTTP ${statusCode || 'n/a'}`
              });
              return;
            }
            resolve({ success: true, text });
          } catch {
            resolve({
              success: false,
              error: `Failed to parse llama.cpp response (${modelName} @ ${port})`
            });
          }
        });
      });
      req.on('error', (err) => resolve({ success: false, error: `llama.cpp fallback error: ${err.message}` }));
      req.setTimeout(120000, () => req.destroy(new Error('llama.cpp fallback timeout')));
      req.write(payload);
      req.end();
    });
  }

  function compilePromptFromMessages(messages) {
    const list = Array.isArray(messages) ? messages : [];
    return list
      .map((m) => {
        const role = String(m?.role || 'user').toUpperCase();
        const content = String(m?.content || '');
        return `${role}:\n${content}`;
      })
      .join('\n\n');
  }

  return {
    requestNonStreamFallback,
    requestGenerateFallback,
    requestLlamaNonStream
  };
}

module.exports = createStreamFallbackHttpTools;
