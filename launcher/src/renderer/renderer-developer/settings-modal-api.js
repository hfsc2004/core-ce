/**
 * Settings Modal - Namespace API surface
 * Keeps inline handlers and external callers on a single object.
 *
 * @version 1.1.2 - March 5, 2026
 */

const __modsNoopAsync = async () => {};
const __loadModsSettings = (typeof loadModsSettings === 'function') ? loadModsSettings : __modsNoopAsync;
const __installModDirectory = (typeof installModDirectory === 'function') ? installModDirectory : __modsNoopAsync;
const __enableSelectedMod = (typeof enableSelectedMod === 'function') ? enableSelectedMod : __modsNoopAsync;
const __disableSelectedMod = (typeof disableSelectedMod === 'function') ? disableSelectedMod : __modsNoopAsync;
const __removeSelectedMod = (typeof removeSelectedMod === 'function') ? removeSelectedMod : __modsNoopAsync;
const __attestSelectedMod = (typeof attestSelectedMod === 'function') ? attestSelectedMod : __modsNoopAsync;
const __attestVoiceAbsence = (typeof attestVoiceAbsence === 'function') ? attestVoiceAbsence : __modsNoopAsync;
const __pickModsSourceDirectory = (typeof pickModsSourceDirectory === 'function') ? pickModsSourceDirectory : __modsNoopAsync;
const __pickModsPrivateKeyFile = (typeof pickModsPrivateKeyFile === 'function') ? pickModsPrivateKeyFile : __modsNoopAsync;
const __createModsKeypair = (typeof createModsKeypair === 'function') ? createModsKeypair : __modsNoopAsync;
const __signModDirectory = (typeof signModDirectory === 'function') ? signModDirectory : __modsNoopAsync;
const __refreshTrustedModKeys = (typeof refreshTrustedModKeys === 'function') ? refreshTrustedModKeys : __modsNoopAsync;
const __saveComplianceProofBadgeVisibility = (typeof saveComplianceProofBadgeVisibility === 'function')
  ? saveComplianceProofBadgeVisibility
  : __modsNoopAsync;
const __workspaceGitNoopAsync = async () => {};
const __workspaceGitNoop = () => {};
const __workspaceGitRefresh = (typeof workspaceGitRefresh === 'function') ? workspaceGitRefresh : __workspaceGitNoopAsync;
const __openWorkspaceGitGuide = (typeof openWorkspaceGitGuide === 'function') ? openWorkspaceGitGuide : __workspaceGitNoopAsync;
const __workspaceGitInit = (typeof workspaceGitInit === 'function') ? workspaceGitInit : __workspaceGitNoopAsync;
const __workspaceGitAddAll = (typeof workspaceGitAddAll === 'function') ? workspaceGitAddAll : __workspaceGitNoopAsync;
const __workspaceGitCommit = (typeof workspaceGitCommit === 'function') ? workspaceGitCommit : __workspaceGitNoopAsync;
const __workspaceGitCheckoutSelectedBranch = (typeof workspaceGitCheckoutSelectedBranch === 'function') ? workspaceGitCheckoutSelectedBranch : __workspaceGitNoopAsync;
const __workspaceGitCreateBranch = (typeof workspaceGitCreateBranch === 'function') ? workspaceGitCreateBranch : __workspaceGitNoopAsync;
const __workspaceGitMergeSelectedBranch = (typeof workspaceGitMergeSelectedBranch === 'function') ? workspaceGitMergeSelectedBranch : __workspaceGitNoopAsync;
const __workspaceGitRollbackToSelected = (typeof workspaceGitRollbackToSelected === 'function') ? workspaceGitRollbackToSelected : __workspaceGitNoopAsync;
const __workspaceGitToggleFileTrackedFromStatusClick = (typeof workspaceGitToggleFileTrackedFromStatusClick === 'function') ? workspaceGitToggleFileTrackedFromStatusClick : __workspaceGitNoopAsync;
const __updateWorkspaceGitRollbackUi = (typeof updateWorkspaceGitRollbackUi === 'function') ? updateWorkspaceGitRollbackUi : __workspaceGitNoop;
const __toggleScmChangedFilesPanel = (typeof toggleScmChangedFilesPanel === 'function') ? toggleScmChangedFilesPanel : __workspaceGitNoop;
const __toggleScmAllFilesPanel = (typeof toggleScmAllFilesPanel === 'function') ? toggleScmAllFilesPanel : __workspaceGitNoop;

window.SettingsModal = {
  // Core
  show: showSettingsModal,
  toggle: toggleSettingsModal,
  close: closeSettingsModal,
  switchTab: switchSettingsTab,

  // HuggingFace
  saveToken: saveHuggingFaceToken,
  toggleTokenVisibility,
  openTokenPage: openHuggingFaceTokenPage,

  // Theme
  loadAndApplyTheme,
  loadThemeFromSettings,  applyThemePreset,
  updateThemeColor,  saveThemeSettings,
  resetThemeToDefaults,
  saveThemeCustom,
  loadThemeCustom,
  deleteThemeCustom,
  refreshCustomThemeList,

  // System
  loadSystemInfo,
  refreshSystemInfo,
  loadSpeechSettings,
  saveSpeechSettings,
  testSpeechInput,
  showTtsDeviceHelp,
  testSpeechOutput,
  loadHardwareSettings,
  refreshHardwareMicrophones,
  saveHardwareSettings,
  testHardwareMicrophone,
  stopHardwareMicrophoneTest,
  toggleGpuMonitor,
  updateGpuMonitorButtonState,
  saveServiceNetworkPolicy,
  saveRelayIngressBind: saveRelayIngressBindSettings,
  saveRelayIngressBindSettings,
  saveSessionMemorySettings,
  saveAnimationSettings,
  saveComplianceProofBadgeVisibility: __saveComplianceProofBadgeVisibility,
  loadComplianceEvidenceManager,
  saveComplianceEvidenceManager,
  addComplianceTrustedKey,
  removeComplianceTrustedKey,
  pickCompliancePrivateKeyPath,
  pickCompliancePublicKeyPath,
  signComplianceEvidence,
  clearSessionMemoryHistory,
  loadModsSettings: __loadModsSettings,
  refreshModsList: __loadModsSettings,
  installModDirectory: __installModDirectory,
  pickModsSourceDirectory: __pickModsSourceDirectory,
  pickModsPrivateKeyFile: __pickModsPrivateKeyFile,
  createModsKeypair: __createModsKeypair,
  signModDirectory: __signModDirectory,
  refreshTrustedModKeys: __refreshTrustedModKeys,
  enableSelectedMod: __enableSelectedMod,
  disableSelectedMod: __disableSelectedMod,
  removeSelectedMod: __removeSelectedMod,
  attestSelectedMod: __attestSelectedMod,
  attestVoiceAbsence: __attestVoiceAbsence,

  // Source Control
  workspaceGitRefresh: __workspaceGitRefresh,
  openWorkspaceGitGuide: __openWorkspaceGitGuide,
  workspaceGitInit: __workspaceGitInit,
  workspaceGitAddAll: __workspaceGitAddAll,
  workspaceGitCommit: __workspaceGitCommit,
  workspaceGitCheckoutSelectedBranch: __workspaceGitCheckoutSelectedBranch,
  workspaceGitCreateBranch: __workspaceGitCreateBranch,
  workspaceGitMergeSelectedBranch: __workspaceGitMergeSelectedBranch,
  workspaceGitRollbackToSelected: __workspaceGitRollbackToSelected,
  workspaceGitToggleFileTrackedFromStatusClick: __workspaceGitToggleFileTrackedFromStatusClick,
  updateWorkspaceGitRollbackUi: __updateWorkspaceGitRollbackUi,
  toggleScmChangedFilesPanel: __toggleScmChangedFilesPanel,
  toggleScmAllFilesPanel: __toggleScmAllFilesPanel
};

// Backward compatibility for older inline/global callers
window.showSettingsModal = window.SettingsModal.show;
window.toggleSettingsModal = window.SettingsModal.toggle;
window.closeSettingsModal = window.SettingsModal.close;
window.switchSettingsTab = window.SettingsModal.switchTab;
window.saveHuggingFaceToken = window.SettingsModal.saveToken;
window.toggleTokenVisibility = window.SettingsModal.toggleTokenVisibility;
window.openHuggingFaceTokenPage = window.SettingsModal.openTokenPage;
window.loadAndApplyTheme = window.SettingsModal.loadAndApplyTheme;window.applyThemePreset = window.SettingsModal.applyThemePreset;
window.updateThemeColor = window.SettingsModal.updateThemeColor;window.saveThemeSettings = window.SettingsModal.saveThemeSettings;
window.resetThemeToDefaults = window.SettingsModal.resetThemeToDefaults;
window.saveThemeCustom = window.SettingsModal.saveThemeCustom;
window.loadThemeCustom = window.SettingsModal.loadThemeCustom;
window.deleteThemeCustom = window.SettingsModal.deleteThemeCustom;
window.refreshCustomThemeList = window.SettingsModal.refreshCustomThemeList;
window.refreshSystemInfo = window.SettingsModal.refreshSystemInfo;
window.loadSpeechSettings = window.SettingsModal.loadSpeechSettings;
window.saveSpeechSettings = window.SettingsModal.saveSpeechSettings;
window.testSpeechInput = window.SettingsModal.testSpeechInput;
window.showTtsDeviceHelp = window.SettingsModal.showTtsDeviceHelp;
window.testSpeechOutput = window.SettingsModal.testSpeechOutput;
window.loadHardwareSettings = window.SettingsModal.loadHardwareSettings;
window.refreshHardwareMicrophones = window.SettingsModal.refreshHardwareMicrophones;
window.saveHardwareSettings = window.SettingsModal.saveHardwareSettings;
window.testHardwareMicrophone = window.SettingsModal.testHardwareMicrophone;
window.toggleGpuMonitor = window.SettingsModal.toggleGpuMonitor;
window.saveServiceNetworkPolicy = window.SettingsModal.saveServiceNetworkPolicy;
window.saveRelayIngressBindSettings = window.SettingsModal.saveRelayIngressBindSettings;
window.saveAnimationSettings = window.SettingsModal.saveAnimationSettings;
window.loadModsSettings = window.SettingsModal.loadModsSettings;
window.installModDirectory = window.SettingsModal.installModDirectory;
window.pickModsSourceDirectory = window.SettingsModal.pickModsSourceDirectory;
window.pickModsPrivateKeyFile = window.SettingsModal.pickModsPrivateKeyFile;
window.createModsKeypair = window.SettingsModal.createModsKeypair;
window.signModDirectory = window.SettingsModal.signModDirectory;
window.refreshTrustedModKeys = window.SettingsModal.refreshTrustedModKeys;
window.enableSelectedMod = window.SettingsModal.enableSelectedMod;
window.disableSelectedMod = window.SettingsModal.disableSelectedMod;
window.removeSelectedMod = window.SettingsModal.removeSelectedMod;
window.attestSelectedMod = window.SettingsModal.attestSelectedMod;
window.attestVoiceAbsence = window.SettingsModal.attestVoiceAbsence;
window.workspaceGitRefresh = window.SettingsModal.workspaceGitRefresh;
window.openWorkspaceGitGuide = window.SettingsModal.openWorkspaceGitGuide;
window.workspaceGitInit = window.SettingsModal.workspaceGitInit;
window.workspaceGitAddAll = window.SettingsModal.workspaceGitAddAll;
window.workspaceGitCommit = window.SettingsModal.workspaceGitCommit;
window.workspaceGitCheckoutSelectedBranch = window.SettingsModal.workspaceGitCheckoutSelectedBranch;
window.workspaceGitCreateBranch = window.SettingsModal.workspaceGitCreateBranch;
window.workspaceGitMergeSelectedBranch = window.SettingsModal.workspaceGitMergeSelectedBranch;
window.workspaceGitRollbackToSelected = window.SettingsModal.workspaceGitRollbackToSelected;
window.workspaceGitToggleFileTrackedFromStatusClick = window.SettingsModal.workspaceGitToggleFileTrackedFromStatusClick;
window.updateWorkspaceGitRollbackUi = window.SettingsModal.updateWorkspaceGitRollbackUi;
window.toggleScmChangedFilesPanel = window.SettingsModal.toggleScmChangedFilesPanel;
window.toggleScmAllFilesPanel = window.SettingsModal.toggleScmAllFilesPanel;
