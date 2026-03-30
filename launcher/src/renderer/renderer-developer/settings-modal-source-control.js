/**
 * Settings Modal - Source Control tab compatibility wrappers
 *
 * @version 1.1.3 - March 5, 2026
 */

function appendSourceControlLog(text) {
  return window.SettingsModalSourceControlUi?.appendSourceControlLog
    ? window.SettingsModalSourceControlUi.appendSourceControlLog(text)
    : undefined;
}

async function openWorkspaceGitGuide() {
  return window.SettingsModalSourceControlActions?.openWorkspaceGitGuide
    ? window.SettingsModalSourceControlActions.openWorkspaceGitGuide()
    : Promise.resolve();
}

function setSourceControlBusy(busy, label = '') {
  return window.SettingsModalSourceControlUi?.setSourceControlBusy
    ? window.SettingsModalSourceControlUi.setSourceControlBusy(busy, label)
    : undefined;
}

function renderWorkspaceGitStatus(status) {
  return window.SettingsModalSourceControlUi?.renderWorkspaceGitStatus
    ? window.SettingsModalSourceControlUi.renderWorkspaceGitStatus(status)
    : undefined;
}

function renderScmFileRow(fileEntry) {
  return window.SettingsModalSourceControlUi?.renderScmFileRow
    ? window.SettingsModalSourceControlUi.renderScmFileRow(fileEntry)
    : '';
}

function escapeHtmlSM(value) {
  return window.SettingsModalSourceControlUi?.escapeHtmlSM
    ? window.SettingsModalSourceControlUi.escapeHtmlSM(value)
    : String(value || '');
}

function setScmChangedFilesCollapsed(collapsed) {
  return window.SettingsModalSourceControlUi?.setScmChangedFilesCollapsed
    ? window.SettingsModalSourceControlUi.setScmChangedFilesCollapsed(collapsed)
    : undefined;
}

function toggleScmChangedFilesPanel() {
  return window.SettingsModalSourceControlUi?.toggleScmChangedFilesPanel
    ? window.SettingsModalSourceControlUi.toggleScmChangedFilesPanel()
    : undefined;
}

function setScmAllFilesCollapsed(collapsed) {
  return window.SettingsModalSourceControlUi?.setScmAllFilesCollapsed
    ? window.SettingsModalSourceControlUi.setScmAllFilesCollapsed(collapsed)
    : undefined;
}

function toggleScmAllFilesPanel() {
  return window.SettingsModalSourceControlUi?.toggleScmAllFilesPanel
    ? window.SettingsModalSourceControlUi.toggleScmAllFilesPanel()
    : undefined;
}

async function workspaceGitToggleFileTrackedFromStatusClick(statusButtonEl) {
  return window.SettingsModalSourceControlActions?.workspaceGitToggleFileTrackedFromStatusClick
    ? window.SettingsModalSourceControlActions.workspaceGitToggleFileTrackedFromStatusClick(statusButtonEl)
    : Promise.resolve();
}

async function loadWorkspaceGitPolicy() {
  return window.SettingsModalSourceControlUi?.loadWorkspaceGitPolicy
    ? window.SettingsModalSourceControlUi.loadWorkspaceGitPolicy()
    : Promise.resolve();
}

async function loadWorkspaceGitStatus() {
  return window.SettingsModalSourceControlUi?.loadWorkspaceGitStatus
    ? window.SettingsModalSourceControlUi.loadWorkspaceGitStatus()
    : Promise.resolve();
}

function updateWorkspaceGitRollbackUi() {
  return window.SettingsModalSourceControlUi?.updateWorkspaceGitRollbackUi
    ? window.SettingsModalSourceControlUi.updateWorkspaceGitRollbackUi()
    : undefined;
}

async function loadWorkspaceGitRefs() {
  return window.SettingsModalSourceControlUi?.loadWorkspaceGitRefs
    ? window.SettingsModalSourceControlUi.loadWorkspaceGitRefs()
    : Promise.resolve();
}

async function workspaceGitRefresh() {
  return window.SettingsModalSourceControlActions?.workspaceGitRefresh
    ? window.SettingsModalSourceControlActions.workspaceGitRefresh()
    : Promise.resolve();
}

async function workspaceGitInit() {
  return window.SettingsModalSourceControlActions?.workspaceGitInit
    ? window.SettingsModalSourceControlActions.workspaceGitInit()
    : Promise.resolve();
}

async function workspaceGitAddAll() {
  return window.SettingsModalSourceControlActions?.workspaceGitAddAll
    ? window.SettingsModalSourceControlActions.workspaceGitAddAll()
    : Promise.resolve();
}

async function workspaceGitCommit() {
  return window.SettingsModalSourceControlActions?.workspaceGitCommit
    ? window.SettingsModalSourceControlActions.workspaceGitCommit()
    : Promise.resolve();
}

async function workspaceGitCheckoutSelectedBranch() {
  return window.SettingsModalSourceControlActions?.workspaceGitCheckoutSelectedBranch
    ? window.SettingsModalSourceControlActions.workspaceGitCheckoutSelectedBranch()
    : Promise.resolve();
}

async function workspaceGitCreateBranch() {
  return window.SettingsModalSourceControlActions?.workspaceGitCreateBranch
    ? window.SettingsModalSourceControlActions.workspaceGitCreateBranch()
    : Promise.resolve();
}

async function workspaceGitMergeSelectedBranch() {
  return window.SettingsModalSourceControlActions?.workspaceGitMergeSelectedBranch
    ? window.SettingsModalSourceControlActions.workspaceGitMergeSelectedBranch()
    : Promise.resolve();
}

async function workspaceGitRollbackToSelected() {
  return window.SettingsModalSourceControlActions?.workspaceGitRollbackToSelected
    ? window.SettingsModalSourceControlActions.workspaceGitRollbackToSelected()
    : Promise.resolve();
}
