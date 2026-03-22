/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * ==========================================================================
 * MOE PIPELINE RENDER - Item Dispatch
 * ==========================================================================
 *
 * Structural split only. Detailed renderers live in moe-pipeline-render-items-*.js.
 * ==========================================================================
 */

function renderMoeItem(item, index, modelsForDropdown) {
  switch (item.type) {
    case 'agent':
      return renderAgentRow(item, index, modelsForDropdown);
    case 'channel':
      return renderChannelRow(item, index);
    case 'gateway':
      return renderGatewayRow(item, index);
    case 'bindings':
      return renderBindingsRow(item, index);
    case 'endpoint_registry':
      return renderEndpointRegistryRow(item, index);
    default:
      return '';
  }
}

window.renderMoeItem = renderMoeItem;
