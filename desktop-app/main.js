const { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell, Tray } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const https = require('node:https');
const path = require('node:path');
const sharp = require('sharp');
const { removeBackground } = require('./background-removal');

function appIconPath() {
  return path.join(__dirname, 'assets', process.platform === 'darwin' ? 'icon.png' : 'icon.ico');
}

const DEFAULT_SIZE = 220;
const MIN_SIZE = 120;
const MAX_SIZE = 340;
const MAX_IMPORT_COUNT = 12;
const MAX_FORM_COUNT = 24;
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
const MAX_CUSTOM_PHRASE_COUNT = 50;
const MAX_CUSTOM_PHRASE_LENGTH = 100;
const HIT_MASK_MAX_SIZE = 256;
const DRAG_EDGE_TRIGGER_PX = 2;
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_API_URL = 'https://api.github.com/repos/laofutsit-design/photo-desktop-pet/releases/latest';
const UPDATE_PAGE_URL = 'https://github.com/laofutsit-design/photo-desktop-pet/releases/latest';
const BUBBLE_FONTS = new Set([
  'system', 'yahei', 'rounded', 'kaiti', 'songti', 'heiti',
  'shoujin', 'xingkai', 'lishu', 'fangsong',
]);
const BUBBLE_STYLES = new Set(['glass', 'cream', 'comic', 'neon', 'nebula', 'minimal']);
const DEFAULT_GROUP_ID = 'default';
const DEFAULT_GROUP_NAME = '角色 1';
const PERSONALITIES = {
  calm: '高冷克制',
  gentle: '温柔治愈',
  energetic: '活泼元气',
  tsundere: '傲娇吐槽',
  foodie: '萌宠馋嘴',
};

let petWindow;
let managerWindow;
let tray;
let petSize = DEFAULT_SIZE;
let alwaysOnTop = false;
let personality = 'calm';
let customPhrases = [];
let bubbleColorMode = 'auto';
let bubbleColor = '#ff9f72';
let bubbleFont = 'system';
let bubbleStyle = 'glass';
let addingPhoto = false;
let processingPhoto = false;
let petReady = false;
let activeDrag;
let dragTimer;
let activeManagerDrag;
let managerDragTimer;
let petWindowFocused = false;
let settingsTimer;
let settingsWriteQueue = Promise.resolve();
let mousePassthrough = false;
let activeFormIndex = 0;
let activeGroupId = DEFAULT_GROUP_ID;
let activePetEdge;
let petHeadProfile = { left: .08, top: .02, right: .92, bottom: .66 };
let lastUpdateCheckAt = 0;
let updateCheckInFlight = false;

function windowSizeForPet(size) {
  return {
    width: Math.max(300, size + 80),
    height: size + 150,
  };
}

function createWindow() {
  const { width, height } = windowSizeForPet(petSize);
  const display = screen.getPrimaryDisplay().workArea;

  petWindow = new BrowserWindow({
    width,
    height,
    x: display.x + display.width - width - 24,
    y: display.y + display.height - height - 24,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  petWindow.on('focus', () => {
    petWindowFocused = true;
    updateAlwaysOnTop();
  });
  petWindow.on('blur', () => {
    petWindowFocused = false;
    updateAlwaysOnTop();
  });
  updateAlwaysOnTop();
  petWindow.loadFile('index.html');
}

function createManagerWindow() {
  if (managerWindow && !managerWindow.isDestroyed()) return managerWindow;

  const width = 440;
  const height = 540;
  const petBounds = petWindow?.getBounds();
  const workArea = screen.getDisplayMatching(petBounds || screen.getPrimaryDisplay().workArea).workArea;
  let x = petBounds ? petBounds.x - width - 16 : workArea.x + Math.round((workArea.width - width) / 2);
  if (x < workArea.x) x = petBounds ? petBounds.x + petBounds.width + 16 : workArea.x;
  x = Math.max(workArea.x, Math.min(workArea.x + workArea.width - width, x));
  const y = Math.max(
    workArea.y,
    Math.min(workArea.y + workArea.height - height, petBounds?.y ?? workArea.y),
  );

  managerWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    transparent: false,
    frame: false,
    resizable: true,
    minWidth: 440,
    minHeight: 540,
    thickFrame: true,
    roundedCorners: false,
    hasShadow: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    backgroundColor: '#fffaf0',
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  managerWindow.loadFile('manager.html');
  managerWindow.once('ready-to-show', () => {
    if (!managerWindow || managerWindow.isDestroyed()) return;
    managerWindow.show();
    managerWindow.focus();
  });
  managerWindow.on('closed', () => {
    stopManagerDrag();
    managerWindow = null;
  });
  return managerWindow;
}

function showPhotoManager() {
  if (!managerWindow || managerWindow.isDestroyed()) {
    createManagerWindow();
    return;
  }
  managerWindow.webContents.send('manager:refresh');
  managerWindow.show();
  managerWindow.focus();
}

function hidePhotoManager() {
  stopManagerDrag();
  if (managerWindow && !managerWindow.isDestroyed()) managerWindow.hide();
}

function canDragPet() {
  return petReady && !addingPhoto && !processingPhoto;
}

function updateAlwaysOnTop() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const enabled = canDragPet() && (alwaysOnTop || petWindowFocused);
  if (process.platform === 'darwin') {
    petWindow.setAlwaysOnTop(enabled, 'floating');
  } else {
    petWindow.setAlwaysOnTop(enabled);
  }
}

function setMousePassthrough(value) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const enabled = Boolean(value) && !activeDrag;
  if (mousePassthrough === enabled) return;
  mousePassthrough = enabled;
  petWindow.setIgnoreMouseEvents(enabled, enabled ? { forward: true } : undefined);
}

function setAddingPhoto(value) {
  addingPhoto = value;
  if (addingPhoto) {
    stopActiveDrag();
    setMousePassthrough(false);
  }
  updateAlwaysOnTop();
}

function setPetReady(value) {
  petReady = value;
  if (!petReady) {
    stopActiveDrag();
    setMousePassthrough(false);
  }
  updateAlwaysOnTop();
}

function scheduleSaveSettings() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    settingsTimer = null;
    saveSettings().catch((error) => console.error('保存设置失败', error));
  }, 250);
}

function setPetSize(nextSize) {
  if (!petWindow || petWindow.isDestroyed()) return;

  petSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(nextSize)));
  const oldBounds = petWindow.getBounds();
  const next = windowSizeForPet(petSize);

  petWindow.setBounds({
    x: Math.round(oldBounds.x + (oldBounds.width - next.width) / 2),
    y: Math.round(oldBounds.y + (oldBounds.height - next.height) / 2),
    width: next.width,
    height: next.height,
  });
  petWindow.webContents.send('pet:size-changed', petSize);
  if (activePetEdge) placePetAtEdge(activePetEdge, false);
  scheduleSaveSettings();
}

function setPersonality(nextPersonality) {
  if (!PERSONALITIES[nextPersonality]) return;
  personality = nextPersonality;
  petWindow.webContents.send('pet:personality-changed', personality);
  scheduleSaveSettings();
}

function normalizeCustomPhrases(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean))];
}

function normalizeBubbleAppearance(value) {
  return {
    colorMode: value?.colorMode === 'custom' ? 'custom' : 'auto',
    color: typeof value?.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color)
      ? value.color.toLowerCase()
      : '#ff9f72',
    font: BUBBLE_FONTS.has(value?.font) ? value.font : 'system',
    style: BUBBLE_STYLES.has(value?.style) ? value.style : 'glass',
  };
}

function parseReleaseVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/i);
  return match ? match.slice(1).map(Number) : null;
}

function isNewerReleaseVersion(latestVersion, currentVersion) {
  const latest = parseReleaseVersion(latestVersion);
  const current = parseReleaseVersion(currentVersion);
  if (!latest || !current) return false;
  for (let index = 0; index < latest.length; index += 1) {
    if (latest[index] !== current[index]) return latest[index] > current[index];
  }
  return false;
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const request = https.get(UPDATE_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'photo-desktop-pet',
      },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`Update check failed with status ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Update check returned invalid JSON'));
        }
      });
    });
    request.setTimeout(10_000, () => request.destroy(new Error('Update check timed out')));
    request.on('error', reject);
  });
}

async function checkForUpdates({ force = false } = {}) {
  if (updateCheckInFlight) return;
  if (!force && Date.now() - lastUpdateCheckAt < UPDATE_CHECK_INTERVAL_MS) return;

  updateCheckInFlight = true;
  lastUpdateCheckAt = Date.now();
  saveSettings().catch((error) => console.warn('Unable to save update-check time', error));

  try {
    const release = await fetchLatestRelease();
    const latestVersion = String(release?.tag_name || '').replace(/^v/i, '');
    const currentVersion = app.getVersion();
    if (!isNewerReleaseVersion(latestVersion, currentVersion)) {
      if (force) {
        await dialog.showMessageBox(petWindow, {
          type: 'info',
          title: '照片桌宠',
          message: '当前已是最新版本',
          detail: `当前版本：v${currentVersion}`,
        });
      }
      return;
    }

    const result = await dialog.showMessageBox(petWindow, {
      type: 'info',
      buttons: ['立即下载', '以后再说'],
      defaultId: 0,
      cancelId: 1,
      title: '照片桌宠有新版本',
      message: `发现新版本 v${latestVersion}`,
      detail: typeof release.body === 'string' && release.body.trim()
        ? release.body.trim().slice(0, 500)
        : '已修复问题并带来新的功能体验。',
    });
    if (result.response === 0) await shell.openExternal(release.html_url || UPDATE_PAGE_URL);
  } catch (error) {
    if (force) {
      await dialog.showMessageBox(petWindow, {
        type: 'warning',
        title: '照片桌宠',
        message: '暂时无法检查更新',
        detail: '请检查网络连接后再试。',
      });
    }
    console.warn('Update check failed', error);
  } finally {
    updateCheckInFlight = false;
  }
}

function showPetWindow() {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.show();
  petWindow.focus();
  updateAlwaysOnTop();
}

function ensureTray() {
  if (tray && !tray.isDestroyed()) return tray;
  tray = new Tray(appIconPath());
  tray.setToolTip('照片桌宠');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示桌宠', click: showPetWindow },
    { type: 'separator' },
    { label: '退出桌宠', click: () => app.quit() },
  ]));
  tray.on('click', showPetWindow);
  return tray;
}

function hideToTray() {
  if (!petWindow || petWindow.isDestroyed()) return;
  ensureTray();
  stopActiveDrag();
  setMousePassthrough(false);
  hidePhotoManager();
  petWindow.hide();
}

async function showPetMenu() {
  if (!petWindow || petWindow.isDestroyed()) return Promise.resolve();
  const manifest = await readManifest();
  const menuGroups = manifest?.groups || [{ id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME }];
  const menuForms = manifest?.forms || (petReady ? [{ groupId: DEFAULT_GROUP_ID }] : []);
  const groupItems = menuGroups.map((group) => ({
    label: group.name,
    type: 'radio',
    checked: group.id === activeGroupId,
    enabled: menuForms.some((form) => form.groupId === group.id),
    click: () => activateGroup(group.id).catch((error) => console.error('切换角色失败', error)),
  }));
  const menu = Menu.buildFromTemplate([
    {
      label: processingPhoto ? '正在生成桌宠…' : (petReady ? '添加照片（可多选）' : '开始生成桌宠'),
      enabled: !processingPhoto,
      click: () => petWindow.webContents.send('pet:choose-photos', { groupId: activeGroupId }),
    },
    {
      label: '管理已添加照片…',
      enabled: !processingPhoto,
      click: showPhotoManager,
    },
    {
      label: '切换角色',
      enabled: groupItems.some((item) => item.enabled),
      submenu: groupItems,
    },
    { type: 'separator' },
    {
      label: '角色性格',
      submenu: Object.entries(PERSONALITIES).map(([key, label]) => ({
        label,
        type: 'radio',
        checked: personality === key,
        click: () => setPersonality(key),
      })),
    },
    {
      label: '桌宠动作',
      enabled: petReady,
      submenu: [
        { label: '吃东西', click: () => petWindow.webContents.send('pet:special-action', 'eat') },
        { label: '大哭', click: () => petWindow.webContents.send('pet:special-action', 'cry') },
        { label: '摔跤', click: () => petWindow.webContents.send('pet:special-action', 'fall') },
        { label: '上蹿下跳', click: () => petWindow.webContents.send('pet:special-action', 'hop') },
        { label: '睡觉', click: () => petWindow.webContents.send('pet:special-action', 'sleep') },
      ],
    },
    {
      label: customPhrases.length > 0
        ? `自定义气泡内容（${customPhrases.length} 条）…`
        : '自定义气泡内容…',
      click: () => petWindow.webContents.send('pet:edit-custom-phrases'),
    },
    {
      label: '调整大小',
      submenu: [
        { label: '小', type: 'radio', checked: petSize < 190, click: () => setPetSize(150) },
        { label: '中', type: 'radio', checked: petSize >= 190 && petSize < 275, click: () => setPetSize(220) },
        { label: '大', type: 'radio', checked: petSize >= 275, click: () => setPetSize(310) },
      ],
    },
    {
      label: '始终置顶',
      type: 'checkbox',
      checked: alwaysOnTop,
      click: (item) => {
        alwaysOnTop = item.checked;
        updateAlwaysOnTop();
        scheduleSaveSettings();
      },
    },
    {
      label: '检查更新',
      click: () => checkForUpdates({ force: true }),
    },
    { type: 'separator' },
    { label: '隐藏到托盘', click: hideToTray },
    { label: '退出桌宠', click: () => app.quit() },
  ]);

  return new Promise((resolve) => menu.popup({
    window: petWindow,
    callback: () => {
      if (!petWindow || petWindow.isDestroyed()) {
        resolve(null);
        return;
      }
      const pointer = screen.getCursorScreenPoint();
      const bounds = petWindow.getBounds();
      resolve({ x: pointer.x - bounds.x, y: pointer.y - bounds.y });
    },
  }));
}

function userDataPath(...parts) {
  return path.join(app.getPath('userData'), ...parts);
}

function settingsFilePath() {
  return userDataPath('settings.json');
}

function petStorePath(...parts) {
  return userDataPath('desktop-pets', ...parts);
}

async function replaceFile(temporary, target) {
  for (const delay of [0, 20, 60]) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      await fs.rename(temporary, target);
      return;
    } catch (error) {
      if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error.code)) throw error;
    }
  }
  await fs.copyFile(temporary, target);
  await fs.unlink(temporary).catch(() => {});
}

function legacyPetFilePath() {
  return userDataPath('desktop-pet.png');
}

function backgroundModelPaths() {
  const writablePath = userDataPath('models', 'isnet-general-use.onnx');
  if (!app.isPackaged) return { modelPath: writablePath };
  return {
    modelPath: path.join(process.resourcesPath, 'models', 'isnet-general-use.onnx'),
    fallbackModelPath: writablePath,
  };
}

async function loadSettings() {
  try {
    const saved = JSON.parse(await fs.readFile(settingsFilePath(), 'utf8'));
    if (Number.isFinite(saved.petSize)) {
      petSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(saved.petSize)));
    }
    if (typeof saved.alwaysOnTop === 'boolean') alwaysOnTop = saved.alwaysOnTop;
    if (PERSONALITIES[saved.personality]) personality = saved.personality;
    if (Number.isFinite(saved.lastUpdateCheckAt) && saved.lastUpdateCheckAt > 0) {
      lastUpdateCheckAt = saved.lastUpdateCheckAt;
    }
    customPhrases = normalizeCustomPhrases(saved.customPhrases)
      .filter((phrase) => phrase.length <= MAX_CUSTOM_PHRASE_LENGTH)
      .slice(0, MAX_CUSTOM_PHRASE_COUNT);
    const appearance = normalizeBubbleAppearance(saved.bubbleAppearance);
    bubbleColorMode = appearance.colorMode;
    bubbleColor = appearance.color;
    bubbleFont = appearance.font;
    bubbleStyle = appearance.style;
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('读取设置失败，将使用默认值', error);
  }
}

function saveSettings() {
  const target = settingsFilePath();
  const temporary = `${target}.tmp`;
  const contents = JSON.stringify({
    petSize,
    alwaysOnTop,
    personality,
    lastUpdateCheckAt,
    customPhrases,
    bubbleAppearance: {
      colorMode: bubbleColorMode,
      color: bubbleColor,
      font: bubbleFont,
      style: bubbleStyle,
    },
  }, null, 2);
  const write = settingsWriteQueue.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(temporary, contents);
    await replaceFile(temporary, target);
  });
  settingsWriteQueue = write;
  return write;
}

function toDataUrl(buffer) {
  const mimeType = buffer.subarray(0, 3).toString('ascii') === 'GIF'
    ? 'image/gif'
    : 'image/png';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function decodeImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') throw new Error('桌宠形态数据无效');
  const match = dataUrl.match(/^data:image\/(png|gif);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) throw new Error('桌宠形态必须是透明 PNG 或 GIF');
  return {
    buffer: Buffer.from(match[2], 'base64'),
    extension: match[1],
  };
}

async function readManifest() {
  try {
    return normalizeManifest(JSON.parse(await fs.readFile(petStorePath('manifest.json'), 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('读取桌宠形态清单失败', error);
    return null;
  }
}

function normalizeGroups(values) {
  const groups = [];
  const ids = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const id = typeof value?.id === 'string' && value.id.trim() ? value.id.trim() : '';
    const name = typeof value?.name === 'string' ? value.name.trim().slice(0, 30) : '';
    if (!id || ids.has(id)) continue;
    ids.add(id);
    groups.push({ id, name: name || `角色 ${groups.length + 1}` });
  }
  if (groups.length === 0) groups.push({ id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME });
  return groups;
}

function normalizeManifest(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (Array.isArray(raw.forms)) {
    const groups = normalizeGroups(raw.groups);
    const groupIds = new Set(groups.map((group) => group.id));
    const forms = raw.forms.flatMap((form) => {
      if (typeof form?.file !== 'string' || path.basename(form.file) !== form.file) return [];
      return [{
        file: form.file,
        groupId: groupIds.has(form.groupId) ? form.groupId : groups[0].id,
        phrases: normalizeCustomPhrases(form.phrases)
          .filter((phrase) => phrase.length <= MAX_CUSTOM_PHRASE_LENGTH)
          .slice(0, MAX_CUSTOM_PHRASE_COUNT),
      }];
    });
    return {
      version: 2,
      groups,
      forms,
      activeGroupId: groupIds.has(raw.activeGroupId) ? raw.activeGroupId : groups[0].id,
    };
  }
  if (!Array.isArray(raw.files)) return null;
  return {
    version: 2,
    groups: [{ id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME }],
    forms: raw.files
      .filter((file) => typeof file === 'string' && path.basename(file) === file)
      .map((file) => ({ file, groupId: DEFAULT_GROUP_ID, phrases: [] })),
    activeGroupId: DEFAULT_GROUP_ID,
  };
}

async function writeManifest(manifest) {
  await fs.mkdir(petStorePath(), { recursive: true });
  const temporary = petStorePath(`manifest-${crypto.randomUUID()}.tmp`);
  await fs.writeFile(temporary, JSON.stringify(manifest, null, 2));
  await replaceFile(temporary, petStorePath('manifest.json'));
}

async function loadSavedForms() {
  const manifest = await readManifest();
  const forms = [];
  const formMetadata = [];

  if (manifest) {
    for (const entry of manifest.forms) {
      try {
        forms.push(toDataUrl(await fs.readFile(petStorePath(entry.file))));
        formMetadata.push({ groupId: entry.groupId, phrases: [...entry.phrases] });
      } catch (error) {
        if (error.code !== 'ENOENT') console.warn(`读取形态 ${entry.file} 失败`, error);
      }
    }

    // An existing manifest is authoritative even when it intentionally contains no forms.
    // Falling back to the legacy image here would resurrect the last photo after deletion.
    const usableGroupId = manifest.groups.some((group) => group.id === manifest.activeGroupId)
      ? manifest.activeGroupId
      : manifest.groups[0].id;
    return {
      forms,
      formMetadata,
      groups: manifest.groups,
      activeGroupId: usableGroupId,
      fromLegacy: false,
    };
  }

  try {
    return {
      forms: [toDataUrl(await fs.readFile(legacyPetFilePath()))],
      formMetadata: [{ groupId: DEFAULT_GROUP_ID, phrases: [] }],
      groups: [{ id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME }],
      activeGroupId: DEFAULT_GROUP_ID,
      fromLegacy: true,
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return {
      forms: [],
      formMetadata: [],
      groups: [{ id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME }],
      activeGroupId: DEFAULT_GROUP_ID,
      fromLegacy: false,
    };
  }
}

async function loadAnimatedHitMasks(index) {
  if (!Number.isInteger(index) || index < 0) return null;
  const manifest = await readManifest();
  const fileName = manifest?.forms?.[index]?.file;
  if (typeof fileName !== 'string' || path.basename(fileName) !== fileName) return null;

  const input = await fs.readFile(petStorePath(fileName));
  const metadata = await sharp(input, { animated: true }).metadata();
  if (metadata.format !== 'gif' || (metadata.pages || 1) <= 1) return null;
  const decoded = await sharp(input, { animated: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pageCount = metadata.pages || 1;
  const pageHeight = decoded.info.pageHeight || metadata.pageHeight
    || Math.floor(decoded.info.height / pageCount);
  const scale = Math.min(1, HIT_MASK_MAX_SIZE / Math.max(decoded.info.width, pageHeight));
  const width = Math.max(1, Math.round(decoded.info.width * scale));
  const height = Math.max(1, Math.round(pageHeight * scale));
  const frameBytes = decoded.info.width * pageHeight * 4;
  const frames = [];

  for (let frameIndex = 0; frameIndex < pageCount; frameIndex += 1) {
    const source = decoded.data.subarray(frameIndex * frameBytes, (frameIndex + 1) * frameBytes);
    const alpha = Buffer.alloc(decoded.info.width * pageHeight);
    for (let pixel = 0; pixel < alpha.length; pixel += 1) alpha[pixel] = source[pixel * 4 + 3];
    const resized = scale < 1
      ? await sharp(alpha, {
        raw: { width: decoded.info.width, height: pageHeight, channels: 1 },
      }).resize(width, height, { fit: 'fill', kernel: 'nearest' }).greyscale().raw().toBuffer()
      : alpha;
    frames.push(resized.toString('base64'));
  }

  return {
    width,
    height,
    delays: Array.from({ length: pageCount }, (_value, frameIndex) => (
      metadata.delay?.[frameIndex] ?? metadata.delay?.at(-1) ?? 100
    )),
    frames,
  };
}

async function saveForms(dataUrls, library = {}) {
  if (!Array.isArray(dataUrls)) throw new Error('桌宠形态列表无效');
  if (dataUrls.length > MAX_FORM_COUNT) {
    throw new Error(`最多保存 ${MAX_FORM_COUNT} 个桌宠形态`);
  }

  const directory = petStorePath();
  await fs.mkdir(directory, { recursive: true });
  const oldManifest = await readManifest();
  const newFiles = [];
  const temporaryManifest = petStorePath(`manifest-${crypto.randomUUID()}.tmp`);
  const groups = normalizeGroups(library.groups);
  const groupIds = new Set(groups.map((group) => group.id));
  const metadata = Array.isArray(library.formMetadata) ? library.formMetadata : [];
  const nextActiveGroupId = groupIds.has(library.activeGroupId)
    ? library.activeGroupId
    : groups[0].id;

  try {
    for (const dataUrl of dataUrls) {
      const decoded = decodeImageDataUrl(dataUrl);
      const fileName = `${crypto.randomUUID()}.${decoded.extension}`;
      await fs.writeFile(petStorePath(fileName), decoded.buffer);
      newFiles.push(fileName);
    }

    const forms = newFiles.map((file, index) => ({
      file,
      groupId: groupIds.has(metadata[index]?.groupId) ? metadata[index].groupId : nextActiveGroupId,
      phrases: normalizeCustomPhrases(metadata[index]?.phrases)
        .filter((phrase) => phrase.length <= MAX_CUSTOM_PHRASE_LENGTH)
        .slice(0, MAX_CUSTOM_PHRASE_COUNT),
    }));
    await fs.writeFile(temporaryManifest, JSON.stringify({
      version: 2,
      groups,
      forms,
      activeGroupId: nextActiveGroupId,
    }, null, 2));
    await replaceFile(temporaryManifest, petStorePath('manifest.json'));
  } catch (error) {
    await Promise.all(newFiles.map((fileName) => fs.unlink(petStorePath(fileName)).catch(() => {})));
    await fs.unlink(temporaryManifest).catch(() => {});
    throw error;
  }

  const currentFiles = new Set(newFiles);
  await Promise.all((oldManifest?.forms || []).map(({ file: fileName }) => {
    if (typeof fileName !== 'string' || path.basename(fileName) !== fileName || currentFiles.has(fileName)) {
      return undefined;
    }
    return fs.unlink(petStorePath(fileName)).catch(() => {});
  }));
}

async function removePhotoBackground(input, photoIndex, photoCount) {
  const output = await removeBackground(input, {
    ...backgroundModelPaths(),
    onProgress: (received, total) => {
      petWindow.webContents.send('pet:model-progress', {
        photoIndex,
        photoCount,
        received,
        total,
      });
    },
    onFrameProgress: (frameIndex, frameCount) => {
      petWindow.webContents.send('pet:model-progress', {
        photoIndex,
        photoCount,
        frameIndex,
        frameCount,
        received: 0,
        total: 0,
      });
    },
  });
  return toDataUrl(output);
}

async function readDroppedSource(source) {
  let input;
  if (typeof source?.filePath === 'string' && source.filePath) {
    input = await fs.readFile(source.filePath);
  } else if (source?.bytes) {
    input = Buffer.from(source.bytes);
  } else {
    throw new Error('没有读取到可用的图片');
  }

  if (input.length === 0) throw new Error('图片内容为空');
  if (input.length > MAX_SOURCE_BYTES) throw new Error('单张图片不能超过 30 MB');
  return input;
}

async function processInputs(inputs) {
  if (inputs.length > MAX_IMPORT_COUNT) {
    throw new Error(`一次最多添加 ${MAX_IMPORT_COUNT} 张照片`);
  }

  const results = [];
  for (let index = 0; index < inputs.length; index += 1) {
    petWindow.webContents.send('pet:model-progress', {
      photoIndex: index + 1,
      photoCount: inputs.length,
      received: 0,
      total: 0,
    });
    results.push(await removePhotoBackground(inputs[index], index + 1, inputs.length));
  }
  return results;
}

async function whileProcessingPhoto(action) {
  if (processingPhoto) throw new Error('正在生成上一批桌宠，请稍候');
  processingPhoto = true;
  stopActiveDrag();
  updateAlwaysOnTop();
  try {
    return await action();
  } finally {
    processingPhoto = false;
    updateAlwaysOnTop();
  }
}

function libraryState(saved, index = activeFormIndex) {
  return {
    forms: saved.forms,
    formMetadata: saved.formMetadata,
    groups: saved.groups,
    activeGroupId,
    activeIndex: index,
  };
}

function sendFormsToPet(saved, index) {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send('pet:forms-replaced', libraryState(saved, index));
}

function manifestMetadataState(manifest) {
  return {
    formMetadata: manifest.forms.map((form) => ({
      groupId: form.groupId,
      phrases: [...form.phrases],
    })),
    groups: manifest.groups.map((group) => ({ ...group })),
    activeGroupId: manifest.activeGroupId,
    activeIndex: activeFormIndex,
  };
}

function sendLibraryMetadataToPet(state) {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send('pet:library-metadata-changed', state);
}

function notifyManagerActiveForm() {
  if (!managerWindow || managerWindow.isDestroyed()) return;
  managerWindow.webContents.send('manager:active-form-changed', activeFormIndex);
}

async function persistActiveGroup(groupId) {
  const manifest = await readManifest();
  if (!manifest || !manifest.groups.some((group) => group.id === groupId)) return;
  manifest.activeGroupId = groupId;
  await writeManifest(manifest);
}

async function activateGroup(groupId) {
  const saved = await loadSavedForms();
  const group = saved.groups.find((item) => item.id === groupId);
  if (!group) throw new Error('这个角色分组已经不存在');
  const nextIndex = saved.formMetadata.findIndex((form) => form.groupId === groupId);
  if (nextIndex < 0) throw new Error('这个角色分组还没有照片');
  activeGroupId = groupId;
  activeFormIndex = nextIndex;
  await persistActiveGroup(groupId);
  sendFormsToPet(saved, activeFormIndex);
  notifyManagerActiveForm();
  return libraryState(saved);
}

async function updateManifestMetadata(mutator) {
  let manifest = await readManifest();
  if (!manifest) {
    const saved = await loadSavedForms();
    await saveForms(saved.forms, saved);
    manifest = await readManifest();
  }
  if (!manifest) throw new Error('照片清单不存在');
  await mutator(manifest);
  await writeManifest(manifest);
  activeGroupId = manifest.groups.some((group) => group.id === manifest.activeGroupId)
    ? manifest.activeGroupId
    : manifest.groups[0].id;
  manifest.activeGroupId = activeGroupId;
  return manifestMetadataState(manifest);
}

ipcMain.handle('pet:choose-photos', () => whileProcessingPhoto(async () => {
  const result = await dialog.showOpenDialog(petWindow, {
    title: '选择一张或多张照片',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'] }],
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  if (result.filePaths.length > MAX_IMPORT_COUNT) {
    throw new Error(`一次最多添加 ${MAX_IMPORT_COUNT} 张照片`);
  }
  const inputs = [];
  for (const filePath of result.filePaths) inputs.push(await readDroppedSource({ filePath }));
  return processInputs(inputs);
}));

ipcMain.handle('pet:import-dropped-photos', (_event, sources) => whileProcessingPhoto(async () => {
  if (!Array.isArray(sources) || sources.length === 0) throw new Error('没有读取到可用的图片');
  if (sources.length > MAX_IMPORT_COUNT) {
    throw new Error(`一次最多添加 ${MAX_IMPORT_COUNT} 张照片`);
  }
  const inputs = [];
  for (const source of sources) inputs.push(await readDroppedSource(source));
  return processInputs(inputs);
}));

ipcMain.handle('pet:save-forms', async (_event, payload) => {
  const forms = Array.isArray(payload) ? payload : payload?.forms;
  const library = Array.isArray(payload) ? {} : payload;
  await saveForms(forms, library);
  activeGroupId = normalizeGroups(library?.groups).some((group) => group.id === library?.activeGroupId)
    ? library.activeGroupId
    : DEFAULT_GROUP_ID;
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.webContents.send('manager:refresh');
  }
  return true;
});
ipcMain.handle('pet:load-forms', loadSavedForms);
ipcMain.handle('pet:load-animated-hit-masks', (_event, index) => loadAnimatedHitMasks(index));
ipcMain.handle('pet:get-state', () => ({
  petSize,
  alwaysOnTop,
  personality,
  customPhrases: [...customPhrases],
  bubbleAppearance: {
    colorMode: bubbleColorMode,
    color: bubbleColor,
      font: bubbleFont,
      style: bubbleStyle,
  },
}));
ipcMain.handle('pet:show-menu', showPetMenu);
ipcMain.handle('pet:set-size', (_event, size) => setPetSize(size));
ipcMain.handle('pet:set-custom-phrases', async (_event, values) => {
  if (!Array.isArray(values)) throw new Error('自定义气泡内容格式无效');
  const nextPhrases = normalizeCustomPhrases(values);
  if (nextPhrases.length > MAX_CUSTOM_PHRASE_COUNT) {
    throw new Error(`最多保存 ${MAX_CUSTOM_PHRASE_COUNT} 条自定义气泡`);
  }
  if (nextPhrases.some((phrase) => phrase.length > MAX_CUSTOM_PHRASE_LENGTH)) {
    throw new Error(`每条气泡不能超过 ${MAX_CUSTOM_PHRASE_LENGTH} 个字符`);
  }

  const previousPhrases = customPhrases;
  customPhrases = nextPhrases;
  try {
    clearTimeout(settingsTimer);
    await saveSettings();
    return [...customPhrases];
  } catch (error) {
    customPhrases = previousPhrases;
    throw error;
  }
});
ipcMain.handle('pet:set-bubble-appearance', async (_event, value) => {
  const next = normalizeBubbleAppearance(value);
  const previous = { bubbleColorMode, bubbleColor, bubbleFont, bubbleStyle };
  bubbleColorMode = next.colorMode;
  bubbleColor = next.color;
  bubbleFont = next.font;
  bubbleStyle = next.style;
  try {
    clearTimeout(settingsTimer);
    await saveSettings();
    return { ...next };
  } catch (error) {
    ({ bubbleColorMode, bubbleColor, bubbleFont, bubbleStyle } = previous);
    throw error;
  }
});
ipcMain.handle('pet:set-bubble-settings', async (_event, value) => {
  if (!Array.isArray(value?.phrases)) throw new Error('自定义气泡内容格式无效');
  const nextPhrases = normalizeCustomPhrases(value.phrases);
  if (nextPhrases.length > MAX_CUSTOM_PHRASE_COUNT) {
    throw new Error(`最多保存 ${MAX_CUSTOM_PHRASE_COUNT} 条自定义气泡`);
  }
  if (nextPhrases.some((phrase) => phrase.length > MAX_CUSTOM_PHRASE_LENGTH)) {
    throw new Error(`每条气泡不能超过 ${MAX_CUSTOM_PHRASE_LENGTH} 个字符`);
  }
  const nextAppearance = normalizeBubbleAppearance(value.appearance);
  const previous = {
    customPhrases,
    bubbleColorMode,
    bubbleColor,
    bubbleFont,
    bubbleStyle,
  };
  customPhrases = nextPhrases;
  bubbleColorMode = nextAppearance.colorMode;
  bubbleColor = nextAppearance.color;
  bubbleFont = nextAppearance.font;
  bubbleStyle = nextAppearance.style;
  try {
    clearTimeout(settingsTimer);
    await saveSettings();
    return { phrases: [...customPhrases], appearance: { ...nextAppearance } };
  } catch (error) {
    ({ customPhrases, bubbleColorMode, bubbleColor, bubbleFont, bubbleStyle } = previous);
    throw error;
  }
});
ipcMain.on('pet:set-adding-photo', (_event, value) => setAddingPhoto(Boolean(value)));
ipcMain.on('pet:set-ready', (_event, value) => setPetReady(Boolean(value)));
ipcMain.on('pet:set-mouse-passthrough', (_event, value) => setMousePassthrough(value));
ipcMain.on('pet:set-head-profile', (_event, value) => {
  const numbers = ['left', 'top', 'right', 'bottom'].map((key) => Number(value?.[key]));
  if (!numbers.every(Number.isFinite)) return;
  const [left, top, right, bottom] = numbers.map((number) => Math.max(0, Math.min(1, number)));
  if (right - left < .15 || bottom - top < .12) return;
  petHeadProfile = { left, top, right, bottom };
  if (activePetEdge) placePetAtEdge(activePetEdge, false);
});
ipcMain.on('pet:set-active-form-index', (_event, request) => {
  const index = Number.isInteger(request) ? request : request?.index;
  if (!Number.isInteger(index) || index < 0) return;
  activeFormIndex = index;
  if (typeof request?.groupId === 'string') activeGroupId = request.groupId;
  notifyManagerActiveForm();
});

ipcMain.handle('manager:get-state', async () => {
  const saved = await loadSavedForms();
  if (!saved.groups.some((group) => group.id === activeGroupId)) activeGroupId = saved.activeGroupId;
  if (saved.forms.length === 0) {
    activeFormIndex = 0;
  } else if (!saved.forms[activeFormIndex]
    || saved.formMetadata[activeFormIndex]?.groupId !== activeGroupId) {
    activeFormIndex = saved.formMetadata.findIndex((form) => form.groupId === activeGroupId);
    if (activeFormIndex < 0) activeFormIndex = 0;
  }
  return libraryState(saved);
});

ipcMain.handle('manager:activate-form', async (_event, index) => {
  const saved = await loadSavedForms();
  if (!Number.isInteger(index) || !saved.forms[index]) throw new Error('这张照片已经不存在');
  activeFormIndex = index;
  activeGroupId = saved.formMetadata[index].groupId;
  await persistActiveGroup(activeGroupId);
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:active-form-changed', {
      index: activeFormIndex,
      activeGroupId,
    });
  }
  notifyManagerActiveForm();
  return { activeIndex: activeFormIndex, activeGroupId };
});

ipcMain.handle('manager:delete-form', async (_event, index) => {
  if (processingPhoto) throw new Error('正在生成桌宠，请稍候再删除');
  const saved = await loadSavedForms();
  if (!Number.isInteger(index) || !saved.forms[index]) throw new Error('这张照片已经不存在');

  const nextForms = saved.forms.filter((_form, formIndex) => formIndex !== index);
  const nextMetadata = saved.formMetadata.filter((_form, formIndex) => formIndex !== index);
  await saveForms(nextForms, { ...saved, formMetadata: nextMetadata, activeGroupId });
  if (nextForms.length === 0) activeFormIndex = 0;
  else if (index < activeFormIndex) activeFormIndex -= 1;
  else activeFormIndex = Math.min(activeFormIndex, nextForms.length - 1);
  const nextSaved = await loadSavedForms();
  if (!nextSaved.formMetadata.some((form) => form.groupId === activeGroupId)) {
    const fallback = nextSaved.formMetadata[activeFormIndex];
    activeGroupId = fallback?.groupId || nextSaved.groups[0].id;
    await persistActiveGroup(activeGroupId);
  }
  sendFormsToPet(nextSaved, activeFormIndex);
  return libraryState(nextSaved);
});

ipcMain.handle('manager:add-photos', (_event, groupId) => {
  if (processingPhoto) return false;
  hidePhotoManager();
  showPetWindow();
  petWindow.webContents.send('pet:choose-photos', { groupId });
  return true;
});

ipcMain.handle('manager:create-group', async () => {
  let createdGroupId;
  const saved = await updateManifestMetadata((manifest) => {
    if (manifest.groups.length >= 12) throw new Error('最多创建 12 个角色分组');
    const id = crypto.randomUUID();
    createdGroupId = id;
    manifest.groups.push({ id, name: `角色 ${manifest.groups.length + 1}` });
  });
  sendLibraryMetadataToPet(saved);
  return { ...saved, selectedGroupId: createdGroupId };
});

ipcMain.handle('manager:rename-group', async (_event, groupId, name) => {
  const nextName = typeof name === 'string' ? name.trim().slice(0, 30) : '';
  if (!nextName) throw new Error('角色名称不能为空');
  const saved = await updateManifestMetadata((manifest) => {
    const group = manifest.groups.find((item) => item.id === groupId);
    if (!group) throw new Error('角色分组已经不存在');
    group.name = nextName;
  });
  sendLibraryMetadataToPet(saved);
  return saved;
});

ipcMain.handle('manager:delete-group', async (_event, groupId) => {
  const saved = await updateManifestMetadata((manifest) => {
    if (manifest.groups.length <= 1) throw new Error('至少保留一个角色分组');
    if (manifest.forms.some((form) => form.groupId === groupId)) {
      throw new Error('请先删除照片或把照片移动到其他角色');
    }
    const index = manifest.groups.findIndex((group) => group.id === groupId);
    if (index < 0) throw new Error('角色分组已经不存在');
    manifest.groups.splice(index, 1);
    if (manifest.activeGroupId === groupId) manifest.activeGroupId = manifest.groups[0].id;
  });
  activeGroupId = saved.activeGroupId;
  sendLibraryMetadataToPet(saved);
  return saved;
});

ipcMain.handle('manager:set-group', async (_event, groupId) => activateGroup(groupId));

ipcMain.handle('manager:move-form', async (_event, index, groupId) => {
  const saved = await updateManifestMetadata((manifest) => {
    if (!manifest.groups.some((group) => group.id === groupId)) throw new Error('目标角色不存在');
    if (!Number.isInteger(index) || !manifest.forms[index]) throw new Error('这张照片已经不存在');
    manifest.forms[index].groupId = groupId;
  });
  if (index === activeFormIndex) {
    activeGroupId = groupId;
    await persistActiveGroup(groupId);
    saved.activeGroupId = groupId;
  }
  sendLibraryMetadataToPet(saved);
  return saved;
});

ipcMain.handle('manager:set-form-phrases', async (_event, index, values) => {
  const phrases = normalizeCustomPhrases(values);
  if (phrases.length > MAX_CUSTOM_PHRASE_COUNT) throw new Error(`每张照片最多保存 ${MAX_CUSTOM_PHRASE_COUNT} 条气泡`);
  if (phrases.some((phrase) => phrase.length > MAX_CUSTOM_PHRASE_LENGTH)) {
    throw new Error(`每条气泡不能超过 ${MAX_CUSTOM_PHRASE_LENGTH} 个字符`);
  }
  const saved = await updateManifestMetadata((manifest) => {
    if (!Number.isInteger(index) || !manifest.forms[index]) throw new Error('这张照片已经不存在');
    manifest.forms[index].phrases = phrases;
  });
  sendLibraryMetadataToPet(saved);
  return saved;
});

ipcMain.on('manager:close', hidePhotoManager);

function stopManagerDrag(expectedId) {
  if (expectedId !== undefined && activeManagerDrag?.id !== expectedId) return;
  activeManagerDrag = null;
  if (managerDragTimer) {
    clearInterval(managerDragTimer);
    managerDragTimer = null;
  }
}

function updateManagerDragPosition() {
  if (!activeManagerDrag || !managerWindow || managerWindow.isDestroyed()) {
    stopManagerDrag();
    return;
  }
  const pointer = screen.getCursorScreenPoint();
  const x = Math.round(activeManagerDrag.origin.x + pointer.x - activeManagerDrag.pointerOrigin.x);
  const y = Math.round(activeManagerDrag.origin.y + pointer.y - activeManagerDrag.pointerOrigin.y);
  if (x === activeManagerDrag.lastPosition.x && y === activeManagerDrag.lastPosition.y) return;
  activeManagerDrag.lastPosition = { x, y };
  managerWindow.setBounds({
    x,
    y,
    width: activeManagerDrag.origin.width,
    height: activeManagerDrag.origin.height,
  });
}

ipcMain.on('manager:begin-drag', (_event, request) => {
  if (!managerWindow || managerWindow.isDestroyed() || !Number.isSafeInteger(request?.id)) return;
  stopManagerDrag();
  const origin = managerWindow.getBounds();
  activeManagerDrag = {
    id: request.id,
    origin,
    pointerOrigin: screen.getCursorScreenPoint(),
    lastPosition: { x: origin.x, y: origin.y },
    started: false,
  };
});

ipcMain.on('manager:drag-to', (_event, request) => {
  if (!activeManagerDrag || request?.id !== activeManagerDrag.id) return;
  if (activeManagerDrag.started) return;
  activeManagerDrag.started = true;
  updateManagerDragPosition();
  managerDragTimer = setInterval(updateManagerDragPosition, 4);
  managerDragTimer.unref?.();
});

ipcMain.on('manager:end-drag', (_event, id) => {
  if (activeManagerDrag?.id === id && activeManagerDrag.started) updateManagerDragPosition();
  stopManagerDrag(id);
});

function stopActiveDrag(expectedId) {
  if (expectedId !== undefined && activeDrag?.id !== expectedId) return;
  activeDrag = null;
  if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
  }
}

function updateActiveDragPosition() {
  if (!activeDrag || !petWindow || petWindow.isDestroyed()) {
    stopActiveDrag();
    return;
  }
  const pointer = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint?.(pointer);
  const displayBounds = display?.bounds;
  const workArea = display?.workArea;
  const candidateBounds = {
    x: Math.round(activeDrag.origin.x + pointer.x - activeDrag.pointerOrigin.x),
    y: Math.round(activeDrag.origin.y + pointer.y - activeDrag.pointerOrigin.y),
    width: activeDrag.origin.width,
    height: activeDrag.origin.height,
  };
  let previewEdge;
  if (displayBounds) {
    const distances = [
      ['left', Math.abs(pointer.x - displayBounds.x)],
      ['right', Math.abs(displayBounds.x + displayBounds.width - 1 - pointer.x)],
      ['top', Math.abs(pointer.y - displayBounds.y)],
      ['bottom', Math.abs(displayBounds.y + displayBounds.height - 1 - pointer.y)],
    ].sort((left, right) => left[1] - right[1]);
    if (distances[0][1] <= DRAG_EDGE_TRIGGER_PX) previewEdge = distances[0][0];
  }
  if (workArea && !previewEdge) {
    const content = petContentBounds(candidateBounds);
    const insideWorkArea = content.left > workArea.x
      && content.right < workArea.x + workArea.width
      && content.top > workArea.y
      && content.bottom < workArea.y + workArea.height;
    if (!activeDrag.edgeDetectionArmed && insideWorkArea) activeDrag.edgeDetectionArmed = true;
    if (activeDrag.edgeDetectionArmed) {
      const crossings = [
        ['left', content.left - workArea.x],
        ['right', workArea.x + workArea.width - content.right],
        ['top', content.top - workArea.y],
        ['bottom', workArea.y + workArea.height - content.bottom],
      ].filter((entry) => entry[1] <= 0)
        .sort((left, right) => left[1] - right[1]);
      previewEdge = crossings[0]?.[0];
    } else {
      previewEdge = activeDrag.startingEdge;
    }
  }
  if (previewEdge !== activeDrag.previewEdge) {
    activeDrag.previewEdge = previewEdge;
    activeDrag.previewDisplay = previewEdge ? display : undefined;
    sendPetEdge(previewEdge);
  }
  const nextBounds = previewEdge
    ? petBoundsAtEdge(candidateBounds, previewEdge, display)
    : candidateBounds;
  if (nextBounds.x === activeDrag.lastPosition.x && nextBounds.y === activeDrag.lastPosition.y) return;
  activeDrag.lastPosition = { x: nextBounds.x, y: nextBounds.y };
  petWindow.setBounds(nextBounds);
}

function sendPetEdge(edge, replay = true) {
  activePetEdge = edge || undefined;
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents?.send?.('pet:edge-action', { edge: activePetEdge, replay });
}

function petContentBounds(bounds) {
  const horizontalInset = Math.round((bounds.width - petSize) / 2);
  const bottomInset = 18;
  return {
    left: bounds.x + horizontalInset,
    right: bounds.x + horizontalInset + petSize,
    top: bounds.y + bounds.height - bottomInset - petSize,
    bottom: bounds.y + bounds.height - bottomInset,
    horizontalInset,
    bottomInset,
  };
}

function petBoundsAtEdge(bounds, edge, display) {
  if (!display) return bounds;
  const workArea = display.workArea;
  const content = petContentBounds(bounds);
  const next = { ...bounds };

  if (edge === 'left') {
    const cut = Math.max(0, 1 - petHeadProfile.bottom);
    next.x = Math.round(workArea.x - content.horizontalInset - petSize * cut);
  } else if (edge === 'right') {
    const cut = petHeadProfile.bottom;
    next.x = Math.round(workArea.x + workArea.width - content.horizontalInset - petSize * cut);
  } else if (edge === 'top') {
    const petTopInset = bounds.height - content.bottomInset - petSize;
    const visualCut = Math.max(0, 1 - petHeadProfile.bottom);
    next.y = Math.round(workArea.y - petTopInset - petSize * visualCut);
  } else if (edge === 'bottom') {
    next.y = workArea.y + workArea.height - bounds.height + content.bottomInset;
  }
  return next;
}

function placePetAtEdge(edge, replay = true, targetDisplay) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = petWindow.getBounds();
  const display = targetDisplay || screen.getDisplayMatching?.(bounds);
  if (!display || !['left', 'right', 'top', 'bottom'].includes(edge)) {
    sendPetEdge(undefined);
    return;
  }
  petWindow.setBounds(petBoundsAtEdge(bounds, edge, display));
  sendPetEdge(edge, replay);
}

ipcMain.on('pet:begin-drag', (_event, request) => {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (!Number.isSafeInteger(request?.id)) return;
  stopActiveDrag();
  const startingEdge = activePetEdge;
  setMousePassthrough(false);
  petWindow.focus();
  petWindowFocused = true;
  updateAlwaysOnTop();
  const origin = petWindow.getBounds();
  activeDrag = {
    id: request.id,
    origin,
    // Physical cursor coordinates prevent window-move events from feeding back into the drag delta.
    pointerOrigin: screen.getCursorScreenPoint(),
    lastPosition: { x: origin.x, y: origin.y },
    startingEdge,
    previewEdge: startingEdge,
    previewDisplay: startingEdge ? screen.getDisplayMatching?.(origin) : undefined,
    edgeDetectionArmed: !startingEdge,
    started: false,
  };
});

ipcMain.on('pet:drag-to', (_event, request) => {
  if (!activeDrag || request?.id !== activeDrag.id || !petWindow || petWindow.isDestroyed()) return;
  if (activeDrag.started) return;
  activeDrag.started = true;
  updateActiveDragPosition();
  dragTimer = setInterval(updateActiveDragPosition, 4);
  dragTimer.unref?.();
});

ipcMain.on('pet:end-drag', (_event, id) => {
  if (activeDrag?.id !== id) return;
  if (!activeDrag.started) {
    stopActiveDrag(id);
    return;
  }
  updateActiveDragPosition();
  const edge = activeDrag?.previewEdge;
  const display = edge ? activeDrag.previewDisplay : undefined;
  stopActiveDrag(id);
  if (edge) placePetAtEdge(edge, true, display);
  else sendPetEdge(undefined);
});

app.whenReady().then(async () => {
  await loadSettings();
  const saved = await loadSavedForms();
  activeGroupId = saved.activeGroupId;
  const savedActiveIndex = saved.formMetadata.findIndex((form) => form.groupId === activeGroupId);
  activeFormIndex = savedActiveIndex >= 0 ? savedActiveIndex : 0;
  createWindow();
  const updateTimer = setTimeout(() => {
    checkForUpdates().catch((error) => console.warn('Update check failed', error));
  }, 2_000);
  updateTimer.unref?.();
});

app.on('window-all-closed', () => app.quit());
