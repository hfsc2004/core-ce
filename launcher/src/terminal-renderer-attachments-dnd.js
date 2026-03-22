/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }

  function isPdfLike(name, type) {
    const lowerName = String(name || '').toLowerCase();
    const lowerType = String(type || '').toLowerCase();
    return lowerType === 'application/pdf' || lowerName.endsWith('.pdf');
  }

  function isEpubLike(name, type) {
    const lowerName = String(name || '').toLowerCase();
    const lowerType = String(type || '').toLowerCase();
    return lowerType === 'application/epub+zip' || lowerName.endsWith('.epub');
  }

  function isOfficeLike(name, type) {
    const lowerName = String(name || '').toLowerCase();
    const lowerType = String(type || '').toLowerCase();
    return lowerType.includes('officedocument')
      || lowerType.includes('msword')
      || lowerType.includes('ms-excel')
      || lowerType.includes('ms-powerpoint')
      || lowerType.includes('opendocument')
      || lowerName.endsWith('.doc')
      || lowerName.endsWith('.docx')
      || lowerName.endsWith('.xls')
      || lowerName.endsWith('.xlsx')
      || lowerName.endsWith('.ppt')
      || lowerName.endsWith('.pptx')
      || lowerName.endsWith('.odt')
      || lowerName.endsWith('.ods')
      || lowerName.endsWith('.odp')
      || lowerName.endsWith('.odg')
      || lowerName.endsWith('.odf');
  }

  function isTextLike(name, type) {
    const lowerName = String(name || '').toLowerCase();
    const lowerType = String(type || '').toLowerCase();
    return lowerType.startsWith('text/')
      || lowerName.endsWith('.md')
      || lowerName.endsWith('.txt')
      || lowerName.endsWith('.json')
      || lowerName.endsWith('.yaml')
      || lowerName.endsWith('.yml')
      || lowerName.endsWith('.csv')
      || lowerName.endsWith('.log')
      || lowerName.endsWith('.xml')
      || lowerName.endsWith('.html')
      || lowerName.endsWith('.js')
      || lowerName.endsWith('.ts')
      || lowerName.endsWith('.py');
  }

  function isImageLike(name, type) {
    const lowerName = String(name || '').toLowerCase();
    const lowerType = String(type || '').toLowerCase();
    return lowerType.startsWith('image/')
      || lowerName.endsWith('.jpg')
      || lowerName.endsWith('.jpeg')
      || lowerName.endsWith('.png')
      || lowerName.endsWith('.gif')
      || lowerName.endsWith('.bmp')
      || lowerName.endsWith('.webp')
      || lowerName.endsWith('.tif')
      || lowerName.endsWith('.tiff');
  }

  function createDragDropController(deps) {
    const getSessionId = typeof deps?.getSessionId === 'function' ? deps.getSessionId : () => 'terminal-default';
    const getElectronAPI = typeof deps?.getElectronAPI === 'function' ? deps.getElectronAPI : () => (window.electronAPI || null);
    const addSystemMessage = typeof deps?.addSystemMessage === 'function' ? deps.addSystemMessage : (() => {});
    const attachFilePath = typeof deps?.attachFilePath === 'function' ? deps.attachFilePath : (async () => {});
    const attachTextContent = typeof deps?.attachTextContent === 'function' ? deps.attachTextContent : (async () => {});
    const attachBinaryContent = typeof deps?.attachBinaryContent === 'function' ? deps.attachBinaryContent : (async () => {});

    let dragOverlay = null;
    let dragDepth = 0;

    function ensureDragOverlay() {
      if (dragOverlay) return dragOverlay;
      dragOverlay = document.createElement('div');
      dragOverlay.id = 'terminal-drag-overlay';
      dragOverlay.style.cssText = [
        'position: fixed',
        'inset: 0',
        'display: none',
        'align-items: center',
        'justify-content: center',
        'background: rgba(0,0,0,0.45)',
        'backdrop-filter: blur(2px)',
        'z-index: 10000',
        'pointer-events: none'
      ].join(';');
      dragOverlay.innerHTML = `
        <div style="border: 2px dashed #00d4ff; border-radius: 12px; padding: 28px 32px; background: rgba(15,52,96,0.65); color: #d8f6ff; font-size: 14px; font-weight: 600;">
          Drop file(s) to attach to this terminal session
        </div>
      `;
      document.body.appendChild(dragOverlay);
      return dragOverlay;
    }

    function showDragOverlay() {
      ensureDragOverlay().style.display = 'flex';
    }

    function hideDragOverlay(force = false) {
      if (!dragOverlay) return;
      if (force) dragDepth = 0;
      if (dragDepth <= 0 || force) {
        dragOverlay.style.display = 'none';
      }
    }

    async function handleDroppedFile(file) {
      const filePath = String(file.path || '').trim();
      if (filePath) {
        await attachFilePath(filePath);
        return { attached: true, fallbackUsed: false };
      }

      const name = String(file.name || '').trim() || 'dropped-file.txt';
      const type = String(file.type || '').toLowerCase();
      const pdfLike = isPdfLike(name, type);
      const epubLike = isEpubLike(name, type);
      const officeLike = isOfficeLike(name, type);
      const imageLike = isImageLike(name, type);
      const textLike = isTextLike(name, type);

      if ((pdfLike || epubLike || officeLike || imageLike) && typeof file.arrayBuffer === 'function') {
        const ab = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(ab);
        await attachBinaryContent(name, base64, file.type || 'application/octet-stream');
        return { attached: true, fallbackUsed: true };
      }

      // Last-resort fallback for unknown non-text files when path access is unavailable.
      if (!textLike && typeof file.arrayBuffer === 'function') {
        const ab = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(ab);
        await attachBinaryContent(name, base64, file.type || 'application/octet-stream');
        return { attached: true, fallbackUsed: true };
      }

      if (!textLike || typeof file.text !== 'function') {
        addSystemMessage(`Skipped dropped file: ${name} (source did not provide a local path or readable content).`);
        return { attached: false, fallbackUsed: false };
      }

      const text = await file.text();
      await attachTextContent(name, text, file.type || 'text/plain');
      return { attached: true, fallbackUsed: true };
    }

    function installDragAndDropAttach() {
      ensureDragOverlay();
      const api = getElectronAPI();
      const hasApi = api && typeof api.terminalAttachmentsAttachFile === 'function';
      if (!hasApi) return;

      document.addEventListener('dragenter', (event) => {
        const dt = event.dataTransfer;
        if (!dt) return;
        const hasFiles = Array.from(dt.types || []).includes('Files');
        if (!hasFiles) return;
        event.preventDefault();
        dragDepth += 1;
        showDragOverlay();
      });

      document.addEventListener('dragover', (event) => {
        const dt = event.dataTransfer;
        if (!dt) return;
        const hasFiles = Array.from(dt.types || []).includes('Files');
        if (!hasFiles) return;
        event.preventDefault();
        dt.dropEffect = 'copy';
        showDragOverlay();
      });

      document.addEventListener('dragleave', (event) => {
        const dt = event.dataTransfer;
        if (!dt) return;
        const hasFiles = Array.from(dt.types || []).includes('Files');
        if (!hasFiles) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) hideDragOverlay();
      });

      document.addEventListener('drop', async (event) => {
        const dt = event.dataTransfer;
        event.preventDefault();
        hideDragOverlay(true);
        if (!dt) {
          addSystemMessage('Drop received, but no transferable data was found.');
          return;
        }

        const fileList = Array.from(dt.files || []);
        if (fileList.length === 0) {
          addSystemMessage('Drop received, but no files were detected.');
          return;
        }

        let attachedCount = 0;
        let fallbackUsed = false;

        for (const file of fileList) {
          try {
            const result = await handleDroppedFile(file);
            if (result.attached) attachedCount += 1;
            if (result.fallbackUsed) fallbackUsed = true;
          } catch (err) {
            const name = String(file?.name || 'unknown-file');
            addSystemMessage(`Skipped dropped file: ${name} (${err.message || err}).`);
          }
        }

        if (attachedCount === 0) {
          addSystemMessage('Drop received, but no attachable files were found.');
        } else if (fallbackUsed) {
          addSystemMessage('✅ Drop attach complete (payload mode: source did not provide local file paths).');
        }
      });

      document.addEventListener('dragend', () => {
        hideDragOverlay(true);
      });

      window.addEventListener('blur', () => {
        hideDragOverlay(true);
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          hideDragOverlay(true);
        }
      });
    }

    return {
      ensureDragOverlay,
      showDragOverlay,
      hideDragOverlay,
      installDragAndDropAttach
    };
  }

  window.TerminalAttachmentDnD = {
    createDragDropController
  };
})();
