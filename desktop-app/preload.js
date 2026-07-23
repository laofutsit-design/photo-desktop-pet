const { contextBridge, ipcRenderer, webUtils } = require('electron');
const { fileURLToPath } = require('node:url');

async function buildDroppedSources(files, uriList) {
  const sources = [];
  const usedPaths = new Set();

  for (const file of Array.from(files || [])) {
    const filePath = webUtils.getPathForFile(file);
    if (filePath) {
      if (!usedPaths.has(filePath)) {
        sources.push({ filePath });
        usedPaths.add(filePath);
      }
    } else {
      sources.push({ bytes: await file.arrayBuffer() });
    }
  }

  for (const line of String(uriList || '').split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith('#') || !value.startsWith('file://')) continue;
    try {
      const filePath = fileURLToPath(value);
      if (!usedPaths.has(filePath)) {
        sources.push({ filePath });
        usedPaths.add(filePath);
      }
    } catch {
      // Ignore malformed URI-list entries and continue with any valid files.
    }
  }

  return sources;
}

contextBridge.exposeInMainWorld('desktopPet', {
  choosePhotos: () => ipcRenderer.invoke('pet:choose-photos'),
  importDroppedPhotos: async (files, uriList = '') => {
    const sources = await buildDroppedSources(files, uriList);
    if (sources.length === 0) {
      throw new Error('没有读取到图片，请先把图片保存到桌面后再拖入');
    }
    return ipcRenderer.invoke('pet:import-dropped-photos', sources);
  },
  saveForms: (library) => ipcRenderer.invoke('pet:save-forms', library),
  loadForms: () => ipcRenderer.invoke('pet:load-forms'),
  loadAnimatedHitMasks: (index) => ipcRenderer.invoke('pet:load-animated-hit-masks', index),
  getState: () => ipcRenderer.invoke('pet:get-state'),
  showMenu: () => ipcRenderer.invoke('pet:show-menu'),
  setSize: (size) => ipcRenderer.invoke('pet:set-size', size),
  setCustomPhrases: (phrases) => ipcRenderer.invoke('pet:set-custom-phrases', phrases),
  setBubbleAppearance: (appearance) => ipcRenderer.invoke('pet:set-bubble-appearance', appearance),
  setBubbleSettings: (value) => ipcRenderer.invoke('pet:set-bubble-settings', value),
  beginDrag: (request) => ipcRenderer.send('pet:begin-drag', request),
  dragTo: (request) => ipcRenderer.send('pet:drag-to', request),
  endDrag: (id) => ipcRenderer.send('pet:end-drag', id),
  setAddingPhoto: (enabled) => ipcRenderer.send('pet:set-adding-photo', enabled),
  setReady: (enabled) => ipcRenderer.send('pet:set-ready', enabled),
  setMousePassthrough: (enabled) => ipcRenderer.send('pet:set-mouse-passthrough', enabled),
  setHeadProfile: (profile) => ipcRenderer.send('pet:set-head-profile', profile),
  setActiveFormIndex: (index, groupId) => ipcRenderer.send(
    'pet:set-active-form-index', { index, groupId },
  ),
  onSizeChanged: (callback) => ipcRenderer.on('pet:size-changed', (_event, size) => callback(size)),
  onEdgeAction: (callback) => ipcRenderer.on('pet:edge-action', (_event, state) => callback(state)),
  onSpecialAction: (callback) => ipcRenderer.on(
    'pet:special-action', (_event, action) => callback(action),
  ),
  onChoosePhotos: (callback) => ipcRenderer.on(
    'pet:choose-photos',
    (_event, options) => callback(options),
  ),
  onActiveFormChanged: (callback) => ipcRenderer.on(
    'pet:active-form-changed',
    (_event, state) => callback(state),
  ),
  onFormsReplaced: (callback) => ipcRenderer.on(
    'pet:forms-replaced',
    (_event, state) => callback(state),
  ),
  onLibraryMetadataChanged: (callback) => ipcRenderer.on(
    'pet:library-metadata-changed',
    (_event, state) => callback(state),
  ),
  onModelProgress: (callback) => ipcRenderer.on('pet:model-progress', (_event, progress) => callback(progress)),
  onPersonalityChanged: (callback) => ipcRenderer.on(
    'pet:personality-changed',
    (_event, nextPersonality) => callback(nextPersonality),
  ),
  onEditCustomPhrases: (callback) => ipcRenderer.on('pet:edit-custom-phrases', () => callback()),
  getManagerState: () => ipcRenderer.invoke('manager:get-state'),
  activateManagedForm: (index) => ipcRenderer.invoke('manager:activate-form', index),
  deleteManagedForm: (index) => ipcRenderer.invoke('manager:delete-form', index),
  addManagedPhotos: (groupId) => ipcRenderer.invoke('manager:add-photos', groupId),
  createManagedGroup: () => ipcRenderer.invoke('manager:create-group'),
  renameManagedGroup: (groupId, name) => ipcRenderer.invoke('manager:rename-group', groupId, name),
  deleteManagedGroup: (groupId) => ipcRenderer.invoke('manager:delete-group', groupId),
  activateManagedGroup: (groupId) => ipcRenderer.invoke('manager:set-group', groupId),
  moveManagedForm: (index, groupId) => ipcRenderer.invoke('manager:move-form', index, groupId),
  setManagedFormPhrases: (index, phrases) => ipcRenderer.invoke(
    'manager:set-form-phrases', index, phrases,
  ),
  beginManagerDrag: (request) => ipcRenderer.send('manager:begin-drag', request),
  dragManagerTo: (request) => ipcRenderer.send('manager:drag-to', request),
  endManagerDrag: (id) => ipcRenderer.send('manager:end-drag', id),
  closePhotoManager: () => ipcRenderer.send('manager:close'),
  onManagerRefresh: (callback) => ipcRenderer.on('manager:refresh', () => callback()),
  onManagerActiveFormChanged: (callback) => ipcRenderer.on(
    'manager:active-form-changed',
    (_event, index) => callback(index),
  ),
});
