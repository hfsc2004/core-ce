/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createUIImageHelpers(deps) {
    const getChatDisplay = typeof deps?.getChatDisplay === 'function' ? deps.getChatDisplay : () => null;
    const formatBytes = typeof deps?.formatBytes === 'function' ? deps.formatBytes : (() => '0 B');

    function openImageLightbox(dataUrl, title) {
      const existing = document.getElementById('terminal-image-lightbox');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'terminal-image-lightbox';
      overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:30060',
        'background:rgba(0,0,0,0.9)',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'padding:24px'
      ].join(';');

      const img = document.createElement('img');
      img.src = String(dataUrl || '');
      img.alt = String(title || 'Image Preview');
      img.style.cssText = [
        'max-width:100%',
        'max-height:100%',
        'width:auto',
        'height:auto',
        'object-fit:contain',
        'border-radius:8px',
        'box-shadow:0 20px 60px rgba(0,0,0,0.5)'
      ].join(';');

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = '×';
      closeBtn.title = 'Close';
      closeBtn.style.cssText = [
        'position:absolute',
        'top:12px',
        'right:16px',
        'width:36px',
        'height:36px',
        'border-radius:18px',
        'border:1px solid rgba(255,255,255,0.35)',
        'background:rgba(17,24,39,0.85)',
        'color:#fff',
        'font-size:24px',
        'line-height:1',
        'cursor:pointer'
      ].join(';');

      const hint = document.createElement('div');
      hint.textContent = `${String(title || 'Image')} • Esc to close`;
      hint.style.cssText = [
        'position:absolute',
        'left:16px',
        'bottom:12px',
        'color:#cbd5e1',
        'font-size:12px',
        'background:rgba(15,23,42,0.8)',
        'border:1px solid rgba(255,255,255,0.2)',
        'border-radius:6px',
        'padding:6px 10px'
      ].join(';');

      const close = () => {
        document.removeEventListener('keydown', onKeyDown);
        overlay.remove();
      };
      const onKeyDown = (event) => {
        if (event.key === 'Escape') close();
      };

      closeBtn.addEventListener('click', close);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
      });
      document.addEventListener('keydown', onKeyDown);

      overlay.appendChild(img);
      overlay.appendChild(closeBtn);
      overlay.appendChild(hint);
      document.body.appendChild(overlay);
    }

    function addSystemImagePreview(preview = {}) {
      const chatDisplay = getChatDisplay();
      if (!chatDisplay) return;

      const dataUrl = String(preview.dataUrl || '').trim();
      if (!dataUrl || !/^data:image\//i.test(dataUrl)) return;

      const title = String(preview.title || 'Image').trim() || 'Image';
      const sizeBytes = Number(preview.sizeBytes) || 0;

      const messageDiv = document.createElement('div');
      messageDiv.className = 'message system';

      const roleDiv = document.createElement('div');
      roleDiv.className = 'message-role';
      roleDiv.textContent = 'system';

      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      contentDiv.dataset.rawContent = `[image-preview] ${title}`;

      const caption = document.createElement('div');
      caption.style.cssText = 'color:#9fd0ff; margin-bottom:8px;';
      caption.textContent = `🖼️ ${title}${sizeBytes > 0 ? ` (${formatBytes(sizeBytes)})` : ''}`;

      const thumbWrap = document.createElement('button');
      thumbWrap.type = 'button';
      thumbWrap.style.cssText = [
        'display:inline-block',
        'padding:0',
        'border:1px solid rgba(255,255,255,0.18)',
        'border-radius:8px',
        'overflow:hidden',
        'background:transparent',
        'cursor:zoom-in'
      ].join(';');
      thumbWrap.title = 'Click to view full screen';
      thumbWrap.addEventListener('click', () => openImageLightbox(dataUrl, title));

      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = title;
      img.loading = 'lazy';
      img.style.cssText = 'display:block; max-width:280px; max-height:220px; width:auto; height:auto; background:#0b1220;';

      thumbWrap.appendChild(img);
      contentDiv.appendChild(caption);
      contentDiv.appendChild(thumbWrap);
      messageDiv.appendChild(roleDiv);
      messageDiv.appendChild(contentDiv);
      chatDisplay.appendChild(messageDiv);
      chatDisplay.scrollTop = chatDisplay.scrollHeight;
    }

    return {
      addSystemImagePreview
    };
  }

  window.TerminalUIImageHelpers = {
    createUIImageHelpers
  };
})();
