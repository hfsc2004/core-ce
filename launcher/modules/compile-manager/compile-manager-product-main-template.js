/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Product main.js template generator for compile manager.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const TEMPLATE_PRELUDE_PATH = path.join(__dirname, 'compile-manager-product-main-template.tpl');
const TEMPLATE_IPC_PATH = path.join(__dirname, 'compile-manager-product-main-template-ipc.tpl');
const TEMPLATE_IPC_EXTRA_PATH = path.join(__dirname, 'compile-manager-product-main-template-ipc-extra.tpl');
const TEMPLATE_LIFECYCLE_PATH = path.join(__dirname, 'compile-manager-product-main-template-lifecycle.tpl');
const PRODUCT_NAME_TOKEN = '__PRODUCT_NAME__';

let cachedTemplate = null;

function loadTemplate() {
  if (cachedTemplate !== null) return cachedTemplate;
  const parts = [
    fs.readFileSync(TEMPLATE_PRELUDE_PATH, 'utf8'),
    fs.readFileSync(TEMPLATE_IPC_PATH, 'utf8'),
    fs.readFileSync(TEMPLATE_IPC_EXTRA_PATH, 'utf8'),
    fs.readFileSync(TEMPLATE_LIFECYCLE_PATH, 'utf8')
  ];
  cachedTemplate = parts.join('\n');
  return cachedTemplate;
}

/**
 * Generate product-specific main.js content
 * Includes essential IPC handlers for Standard Edition functionality
 *
 * @param {Object} config - Compile configuration
 * @returns {string} main.js content
 */
function generateProductMainJs(config) {
  const productName = String(config?.productName || 'Pseudo Science Fiction').trim();
  const template = loadTemplate();
  return template.split(PRODUCT_NAME_TOKEN).join(productName);
}

module.exports = {
  generateProductMainJs
};
