/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createContextMenuController(deps) {
    const getUserInput = typeof deps?.getUserInput === 'function' ? deps.getUserInput : () => null;
    const getChatDisplay = typeof deps?.getChatDisplay === 'function' ? deps.getChatDisplay : () => null;

    function installContextMenu() {
      const userInput = getUserInput();
      const chatDisplay = getChatDisplay();

      document.addEventListener('contextmenu', (e) => {
        e.preventDefault();

        const existingMenu = document.getElementById('psf-context-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.id = 'psf-context-menu';
        menu.style.cssText = `
          position: fixed;
          top: ${e.clientY}px;
          left: ${e.clientX}px;
          background: #1a1a2e;
          border: 1px solid #2d2d44;
          border-radius: 6px;
          padding: 4px 0;
          z-index: 9999;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          min-width: 120px;
        `;

        const selection = window.getSelection().toString();
        if (selection) {
          const copyItem = document.createElement('div');
          copyItem.textContent = 'Copy';
          copyItem.style.cssText = 'padding: 8px 16px; cursor: pointer; color: #e0e0e0; font-size: 13px;';
          copyItem.onmouseenter = () => copyItem.style.background = '#2d2d44';
          copyItem.onmouseleave = () => copyItem.style.background = 'transparent';
          copyItem.onclick = () => {
            navigator.clipboard.writeText(selection);
            menu.remove();
          };
          menu.appendChild(copyItem);
        }

        if (e.target === userInput || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
          const pasteItem = document.createElement('div');
          pasteItem.textContent = 'Paste';
          pasteItem.style.cssText = 'padding: 8px 16px; cursor: pointer; color: #e0e0e0; font-size: 13px;';
          pasteItem.onmouseenter = () => pasteItem.style.background = '#2d2d44';
          pasteItem.onmouseleave = () => pasteItem.style.background = 'transparent';
          pasteItem.onclick = () => {
            navigator.clipboard.readText().then(text => {
              if (e.target.setRangeText) {
                e.target.setRangeText(text, e.target.selectionStart, e.target.selectionEnd, 'end');
              } else {
                e.target.value += text;
              }
            });
            menu.remove();
          };
          menu.appendChild(pasteItem);
        }

        const selectAllItem = document.createElement('div');
        selectAllItem.textContent = 'Select All';
        selectAllItem.style.cssText = 'padding: 8px 16px; cursor: pointer; color: #e0e0e0; font-size: 13px;';
        selectAllItem.onmouseenter = () => selectAllItem.style.background = '#2d2d44';
        selectAllItem.onmouseleave = () => selectAllItem.style.background = 'transparent';
        selectAllItem.onclick = () => {
          if (e.target.select) {
            e.target.select();
          } else if (chatDisplay) {
            const range = document.createRange();
            range.selectNodeContents(chatDisplay);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
          }
          menu.remove();
        };
        menu.appendChild(selectAllItem);

        document.body.appendChild(menu);
        const closeMenu = () => {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
      });
    }

    return {
      installContextMenu
    };
  }

  window.TerminalContextMenu = {
    createContextMenuController
  };
})();
