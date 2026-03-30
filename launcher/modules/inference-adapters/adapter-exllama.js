/**
 * PSF Inference Adapter - ExLLaMA2 (stub)
 *
 * @module adapter-exllama
 * @version 1.1.3 - March 5, 2026
 */

module.exports = {
  name: 'exllama2',
  async listModels() {
    return { success: false, error: 'exllama2_adapter_stub_unimplemented', models: [] };
  },
  async sendMessage() {
    return { success: false, error: 'exllama2_adapter_stub_unimplemented' };
  },
  async sendMessageStream() {
    return { success: false, error: 'exllama2_adapter_stub_unimplemented' };
  }
};
