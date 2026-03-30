/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const { Menu, clipboard } = require('electron');

function attachStandardContextMenu(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.on('context-menu', (event, params) => {
    const hasSelection = Boolean(params.selectionText && params.selectionText.trim());
    const canEdit = params.isEditable;
    const canCopyLink = Boolean(params.linkURL);

    const template = [];
    if (hasSelection) template.push({ label: 'Copy', role: 'copy' });
    if (canEdit) {
      template.push(
        { label: 'Cut', role: 'cut' },
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        { type: 'separator' }
      );
    }
    if (canCopyLink) {
      template.push({
        label: 'Copy Link Address',
        click: () => clipboard.writeText(params.linkURL || '')
      });
    }
    template.push({ type: 'separator' }, { label: 'Select All', role: 'selectAll' });
    Menu.buildFromTemplate(template).popup({ window: win });
  });
}

module.exports = {
  attachStandardContextMenu
};
