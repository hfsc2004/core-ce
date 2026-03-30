/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Generated product template builders for compile manager.
 */
'use strict';

const { generateProductMainJs } = require('./compile-manager-product-main-template');

function generatePackageJson(config) {
  return {
    name: config.productName.toLowerCase().replace(/\s+/g, '-'),
    version: config.version,
    description: config.description || `${config.productName} - AI Model Collection`,
    main: 'main.js',
    author: 'Pseudo Science Fiction',
    license: 'SEE LICENSE',
    scripts: {
      start: 'electron .'
    },
    dependencies: {
      'better-sqlite3': '^12.4.6',
      'node-pty': '^1.0.0'
    },
    devDependencies: {
      electron: '^39.2.3'
    }
  };
}

module.exports = {
  generatePackageJson,
  generateProductMainJs
};
