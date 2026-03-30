/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

const availability = require('./local-transformers-availability');
const tts = require('./local-transformers-tts');
const stt = require('./local-transformers-stt');
const maintenance = require('./local-transformers-maintenance');

module.exports = {
  checkLocalTransformersAvailability: availability.checkLocalTransformersAvailability,
  checkLocalTransformersSttAvailability: availability.checkLocalTransformersSttAvailability,
  synthesizeWithLocalTransformers: tts.synthesizeWithLocalTransformers,
  transcribeWithLocalTransformers: stt.transcribeWithLocalTransformers,
  testLocalTransformersStt: stt.testLocalTransformersStt,
  prewarmLocalTransformersStt: stt.prewarmLocalTransformersStt,
  prewarmLocalTransformers: tts.prewarmLocalTransformers,
  checkLocalVoiceRuntime: maintenance.checkLocalVoiceRuntime,
  installLocalVoiceRuntime: maintenance.installLocalVoiceRuntime,
  deleteLocalVoiceRuntime: maintenance.deleteLocalVoiceRuntime
};
