/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * ============================================================================
 * MOE PIPELINE OPS - Bindings Operations
 * ============================================================================
 *
 * Extracted from moe-pipeline-ops.js to keep that file manageable.
 * No behavior changes: this is a structural split only.
 * ============================================================================
 */

function addBindingEntry(bindingsId) {
  const block = window.modelOrderingState.moeItems.find(i => i.id === bindingsId && i.type === 'bindings');
  if (!block) return;
  if (!Array.isArray(block.entries)) block.entries = [];
  block.entries.push({ key: '', value: '' });
  renderModelOrdering();
}

function removeBindingEntry(bindingsId, index) {
  const block = window.modelOrderingState.moeItems.find(i => i.id === bindingsId && i.type === 'bindings');
  if (!block || !Array.isArray(block.entries)) return;
  if (index < 0 || index >= block.entries.length) return;
  block.entries.splice(index, 1);
  renderModelOrdering();
}

function updateBindingEntry(bindingsId, index, field, value) {
  const block = window.modelOrderingState.moeItems.find(i => i.id === bindingsId && i.type === 'bindings');
  if (!block) return;
  if (!Array.isArray(block.entries)) block.entries = [];
  if (!block.entries[index]) block.entries[index] = { key: '', value: '' };
  const safeField = field === 'key' ? 'key' : 'value';
  block.entries[index][safeField] = String(value || '');
}

function applyBindingInputText(input, nextValue, cursorPos, bindingsId, index, field) {
  if (!input) return;
  input.value = String(nextValue ?? '');
  if (Number.isInteger(cursorPos)) {
    input.setSelectionRange(cursorPos, cursorPos);
  }
  updateBindingEntry(bindingsId, index, field, input.value);
}

function handleBindingInputKeydown(event, bindingsId, index, field) {
  const input = event?.target;
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
    return true;
  }

  if (event.defaultPrevented) {
    return false;
  }

  const key = String(event.key || '');
  const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
  const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : input.value.length;

  // Let browser handle navigation and standard shortcuts.
  if (
    event.ctrlKey || event.metaKey || event.altKey ||
    key === 'Tab' || key === 'Enter' ||
    key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown' ||
    key === 'Home' || key === 'End' || key === 'PageUp' || key === 'PageDown' ||
    key === 'Escape'
  ) {
    return true;
  }

  if (key === 'Backspace') {
    event.preventDefault();
    event.stopPropagation();
    if (start !== end) {
      const next = `${input.value.slice(0, start)}${input.value.slice(end)}`;
      applyBindingInputText(input, next, start, bindingsId, index, field);
      return false;
    }
    if (start > 0) {
      const next = `${input.value.slice(0, start - 1)}${input.value.slice(end)}`;
      applyBindingInputText(input, next, start - 1, bindingsId, index, field);
    }
    return false;
  }

  if (key === 'Delete') {
    event.preventDefault();
    event.stopPropagation();
    if (start !== end) {
      const next = `${input.value.slice(0, start)}${input.value.slice(end)}`;
      applyBindingInputText(input, next, start, bindingsId, index, field);
      return false;
    }
    if (start < input.value.length) {
      const next = `${input.value.slice(0, start)}${input.value.slice(start + 1)}`;
      applyBindingInputText(input, next, start, bindingsId, index, field);
    }
    return false;
  }

  if (key.length === 1) {
    event.preventDefault();
    event.stopPropagation();
    const next = `${input.value.slice(0, start)}${key}${input.value.slice(end)}`;
    applyBindingInputText(input, next, start + 1, bindingsId, index, field);
    return false;
  }

  return true;
}

window.addBindingEntry = addBindingEntry;
window.removeBindingEntry = removeBindingEntry;
window.updateBindingEntry = updateBindingEntry;
window.handleBindingInputKeydown = handleBindingInputKeydown;
