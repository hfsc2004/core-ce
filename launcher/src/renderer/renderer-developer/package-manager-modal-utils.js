/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function packageManagerModalUtilsScope() {
  let dragState = { isDragging: false, modal: null, offsetX: 0, offsetY: 0 };

  function initDraggableModal(modalId, handleId) {
    const modal = document.getElementById(modalId);
    const handle = document.getElementById(handleId);
    if (!modal || !handle) return;

    handle.style.cursor = 'move';

    handle.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      dragState.isDragging = true;
      dragState.modal = modal;
      dragState.offsetX = e.clientX - modal.offsetLeft;
      dragState.offsetY = e.clientY - modal.offsetTop;
      modal.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragState.isDragging || !dragState.modal) return;
      e.preventDefault();

      let newX = e.clientX - dragState.offsetX;
      let newY = e.clientY - dragState.offsetY;

      const maxX = window.innerWidth - dragState.modal.offsetWidth;
      const maxY = window.innerHeight - dragState.modal.offsetHeight;
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      dragState.modal.style.left = newX + 'px';
      dragState.modal.style.top = newY + 'px';
    });

    document.addEventListener('mouseup', () => {
      dragState.isDragging = false;
      dragState.modal = null;
    });
  }

  function centerModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const x = (window.innerWidth - modal.offsetWidth) / 2;
    const y = Math.max(20, (window.innerHeight - modal.offsetHeight) / 2);
    modal.style.left = x + 'px';
    modal.style.top = y + 'px';
  }

  window.packageManagerModalUtils = {
    initDraggableModal,
    centerModal
  };
})();
