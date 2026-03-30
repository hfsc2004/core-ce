/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const fs = require('fs');
const path = require('path');

function createModelOrderingHandlers() {
  return {
    'get-model-ordering': (ctx) => {
      const orderingPath = path.join(ctx.appDir, '..', 'models', 'model-ordering.json');

      try {
        if (fs.existsSync(orderingPath)) {
          const data = fs.readFileSync(orderingPath, 'utf8');
          return JSON.parse(data);
        }
        return null;
      } catch (err) {
        console.error('[Model Ordering] Error reading:', err);
        return null;
      }
    },

    'save-model-ordering': (ctx, event, orderingData) => {
      const orderingPath = path.join(ctx.appDir, '..', 'models', 'model-ordering.json');

      try {
        let existingData = {};
        if (fs.existsSync(orderingPath)) {
          existingData = JSON.parse(fs.readFileSync(orderingPath, 'utf8'));
        }

        const mergedData = {
          ...orderingData,
          _moeDocumentation: existingData._moeDocumentation || orderingData._moeDocumentation
        };

        fs.writeFileSync(orderingPath, JSON.stringify(mergedData, null, 2), 'utf8');
        console.log('[Model Ordering] Saved successfully');
        return { success: true, message: 'Model ordering saved' };
      } catch (err) {
        console.error('[Model Ordering] Error saving:', err);
        return { success: false, message: err.message };
      }
    }
  };
}

module.exports = { createModelOrderingHandlers };
