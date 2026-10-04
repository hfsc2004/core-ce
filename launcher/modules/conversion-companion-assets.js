'use strict';

// Data assets, not an architecture registry or a tensor conversion implementation.
// Each format needs an exact compatibility verifier before supplementation.
const ASSETS = Object.freeze({
  'rwkv_vocab_v20230424.txt': Object.freeze({
    repository: 'BlinkDL/ChatRWKV',
    revision: '02058ba0624a77c20f0913f83550835eb03a8db4',
    path: 'tokenizer/rwkv_vocab_v20230424.txt',
    sha256: 'e6dee3d4e31b4d5c40ac99508ac6c701ceef4bed681bf2167ce9a908552bca89',
    verifier: 'verify-rwkv-vocabulary'
  })
});
function companion(name) {
  const asset = ASSETS[name];
  if (!asset) return null;
  return { ...asset, url: `https://raw.githubusercontent.com/${asset.repository}/${asset.revision}/${asset.path}` };
}
module.exports = { companion, names: Object.keys(ASSETS) };
