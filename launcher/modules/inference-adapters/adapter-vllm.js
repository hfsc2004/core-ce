/**
 * PSF Inference Adapter - vLLM (stub)
 *
 * @module adapter-vllm
 * @version 1.1.3 - March 5, 2026
 */

module.exports = {
  name: 'vllm',
  async listModels() {
    return { success: false, error: 'vllm_adapter_stub_unimplemented', models: [] };
  },
  async sendMessage() {
    return { success: false, error: 'vllm_adapter_stub_unimplemented' };
  },
  async sendMessageStream() {
    return { success: false, error: 'vllm_adapter_stub_unimplemented' };
  }
};
