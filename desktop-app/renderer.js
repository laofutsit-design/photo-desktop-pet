const pet = document.querySelector('#pet');
const petPose = document.querySelector('#petPose');
const petEffect = document.querySelector('#petEffect');
const bubble = document.querySelector('#bubble');
const importButton = document.querySelector('#importButton');
const loading = document.querySelector('#loading');
const loadingDetail = document.querySelector('#loadingDetail');
const errorBox = document.querySelector('#error');
const dropHint = document.querySelector('#dropHint');
const bubbleEditor = document.querySelector('#bubbleEditor');
const bubbleEditorDragHandle = document.querySelector('#bubbleEditorDragHandle');
const customPhrasesInput = document.querySelector('#customPhrasesInput');
const bubbleEditorStatus = document.querySelector('#bubbleEditorStatus');
const cancelBubbleEditor = document.querySelector('#cancelBubbleEditor');
const saveBubbleEditor = document.querySelector('#saveBubbleEditor');
const bubbleColorMode = document.querySelector('#bubbleColorMode');
const bubbleColorInput = document.querySelector('#bubbleColorInput');
const bubbleFontSelect = document.querySelector('#bubbleFontSelect');
const bubbleStyleSelect = document.querySelector('#bubbleStyleSelect');

const interactions = ['squash', 'twirl', 'jump', 'shake', 'bounce', 'nod', 'bow', 'sway', 'stretch', 'tiptoe'];
const idleActions = ['idle-breathe', 'idle-look', 'idle-sway', 'idle-blink'];
const specialActions = [
  'special-eat', 'special-cry', 'special-fall', 'special-hop', 'special-sleep',
];
const allActions = [...interactions, ...idleActions, ...specialActions];
const bubbleEffects = [
  'bubble-pop', 'bubble-float', 'bubble-wobble', 'bubble-sparkle', 'bubble-meteor', 'bubble-aurora',
];
const bubbleDirections = ['up', 'down', 'left', 'right'];
const bubbleFontStacks = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
  yahei: '"Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
  rounded: 'YouYuan, "Microsoft YaHei UI", sans-serif',
  kaiti: 'KaiTi, STKaiti, serif',
  songti: 'SimSun, "Songti SC", serif',
  heiti: 'SimHei, "Microsoft YaHei UI", sans-serif',
  shoujin: '"FZShouJinShu-S10S", "方正瘦金书简体", STKaiti, KaiTi, serif',
  xingkai: 'STXingkai, "华文行楷", KaiTi, STKaiti, serif',
  lishu: 'LiSu, "隶书", SimSun, serif',
  fangsong: 'FangSong, STFangsong, SimSun, serif',
};
const bubbleStyles = new Set(['glass', 'cream', 'comic', 'neon', 'nebula', 'minimal']);
const DRAG_THRESHOLD = 7;
const DOUBLE_CLICK_DELAY = 400;
const HIT_MASK_MAX_SIZE = 512;
const HIT_ALPHA_THRESHOLD = 128;
const MAX_CUSTOM_PHRASE_COUNT = 50;
const MAX_CUSTOM_PHRASE_LENGTH = 100;
const personalityPhrases = {
  calm: [
    '嗯，我在。', '安静一点也很好。', '别急，慢慢来。', '今天还算顺利。', '我只是在观察。',
    '休息一下，不丢人。', '有事就说，我听着。', '风有点吵。', '你做得比想象中好。', '先把心放稳。',
    '不必解释，我懂。', '偶尔发呆也不错。', '我会待在这里。', '今天就到此为止吧。', '嗯……继续。',
  ],
  gentle: [
    '辛苦啦，抱一下。', '慢慢来，我陪你。', '记得喝一口水呀。', '今天也很努力呢。', '累了就看看我。',
    '把烦恼先放一会儿。', '愿你今天有小惊喜。', '没关系，已经很好了。', '给你一颗安心糖。', '深呼吸，放松一点。',
    '你的心情很重要。', '我为你留着好心情。', '别忘了照顾自己。', '温柔也可以很有力量。', '现在，笑一下好吗？',
  ],
  energetic: [
    '出发！今天也要闪闪发光！', '能量满格，冲呀！', '嘿！抓到你偷懒啦！', '再点一下，我还能跳！', '快乐正在加速加载！',
    '小目标，马上拿下！', '今天适合大干一场！', '烦恼退散，活力登场！', '我宣布：你超厉害！', '来比比谁更有精神！',
    '叮！好运已送达！', '不许低头，皇冠会掉！', '笑一个，元气翻倍！', '三、二、一，起飞！', '休息五分钟，再战！',
  ],
  tsundere: [
    '才、才不是在等你。', '点轻一点，笨蛋。', '我只是碰巧陪着你。', '做完了吗？还挺快。', '别误会，我没在担心。',
    '哼，这次算你厉害。', '累了就休息，逞什么强。', '再看我也不会害羞。', '夸你一句，别得意。', '我可没有想你。',
    '这么简单都要我提醒？', '好吧，只陪你一会儿。', '表现不错……勉强及格。', '不准把我关掉。', '你回来得也太慢了。',
  ],
  foodie: [
    '有小鱼干吗？', '闻到了，是零食！', '工作可以，先开饭。', '这一口是替你吃的。', '肚子说它想加餐。',
    '没有零食，我就躺平。', '今天吃点好的吧！', '我很乖，奖励呢？', '再点一下就开饭吗？', '梦想是无限续碗。',
    '烦恼不能吃，扔掉吧。', '这个看起来能咬吗？', '吃饱才有力气陪你。', '分我一口，就一口。', '快乐的味道，香香的。',
  ],
};

let petSize = 220;
let personality = 'calm';
let interactionIndex = 0;
let petForms = [];
let formMetadata = [];
let groups = [{ id: 'default', name: '角色 1' }];
let activeGroupId = 'default';
let activeFormIndex = 0;
let customPhrases = [];
let bubbleAppearance = {
  colorMode: 'auto', color: '#ff9f72', font: 'system', style: 'glass',
};
let autoBubbleColor = '#ff9f72';
let bubbleColorRequest = 0;
let lastPhrase = '';
let bubbleTimer;
let singleClickTimer;
let uiRecoveryTimer;
let dragState;
let nextDragId = 0;
let suppressImportClickUntil = 0;
let fileDragDepth = 0;
let importInFlight = false;
let uiState = 'empty';
let activeHitMask;
let hitMaskRequest = 0;
let animatedHitMaskTimer;
let mousePassthrough;
let lastPointer;
let nativeMenuOpen = false;
let hitTestAnimationFrame;
let hitTestTrackingUntil = 0;
let idleTimer;
let pendingImportGroupId;
let activeEdge;
let specialActionTimer;
let activeHeadProfile = { left: .08, top: .02, right: .92, bottom: .66 };

function setPetSize(size) {
  petSize = size;
  document.documentElement.style.setProperty('--pet-size', `${size}px`);
  requestAnimationFrame(refreshMousePolicy);
}

function hexToRgb(value) {
  const match = String(value).match(/^#([0-9a-f]{6})$/i);
  if (!match) return { r: 255, g: 159, b: 114 };
  return {
    r: Number.parseInt(match[1].slice(0, 2), 16),
    g: Number.parseInt(match[1].slice(2, 4), 16),
    b: Number.parseInt(match[1].slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
    .join('')}`;
}

function applyBubbleAppearance(appearance = bubbleAppearance) {
  const color = appearance.colorMode === 'custom' ? appearance.color : autoBubbleColor;
  const { r, g, b } = hexToRgb(color);
  document.documentElement.style.setProperty('--bubble-accent', color);
  document.documentElement.style.setProperty('--bubble-accent-rgb', `${r} ${g} ${b}`);
  document.documentElement.style.setProperty(
    '--bubble-font',
    bubbleFontStacks[appearance.font] || bubbleFontStacks.system,
  );
  for (const style of bubbleStyles) bubble.classList.remove(`bubble-style-${style}`);
  const style = bubbleStyles.has(appearance.style) ? appearance.style : 'glass';
  bubble.classList.add(`bubble-style-${style}`);
}

async function updateAutoBubbleColor(dataUrl) {
  const request = ++bubbleColorRequest;
  try {
    const image = await loadImage(dataUrl);
    if (request !== bubbleColorRequest) return;
    const scale = Math.min(1, 64 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const bins = new Map();

    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3] < 160) continue;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const maximum = Math.max(r, g, b);
      const minimum = Math.min(r, g, b);
      const lightness = (maximum + minimum) / 2;
      const saturation = maximum === minimum
        ? 0
        : (maximum - minimum) / (255 - Math.abs(2 * lightness - 255));
      if (lightness < 42 || lightness > 242 || (saturation < .08 && lightness > 205)) continue;
      const key = `${r >> 5},${g >> 5},${b >> 5}`;
      const bin = bins.get(key) || { r: 0, g: 0, b: 0, weight: 0, count: 0 };
      const weight = .65 + Math.min(1, saturation) * 1.35;
      bin.r += r;
      bin.g += g;
      bin.b += b;
      bin.weight += weight;
      bin.count += 1;
      bins.set(key, bin);
    }

    const dominant = [...bins.values()].sort((left, right) => right.weight - left.weight)[0];
    if (dominant) {
      autoBubbleColor = rgbToHex(
        dominant.r / dominant.count,
        dominant.g / dominant.count,
        dominant.b / dominant.count,
      );
    }
    if (request !== bubbleColorRequest) return;
    if (bubbleAppearance.colorMode === 'auto') applyBubbleAppearance();
    if (!bubbleEditor.hidden && bubbleColorMode.value === 'auto') bubbleColorInput.value = autoBubbleColor;
  } catch (error) {
    console.warn('无法提取桌宠主色，将使用默认气泡颜色', error);
  }
}

function setUiState(state, message = '') {
  clearTimeout(uiRecoveryTimer);
  uiRecoveryTimer = null;
  uiState = state;
  importButton.hidden = state !== 'empty';
  loading.hidden = state !== 'loading';
  petPose.hidden = state !== 'ready';
  errorBox.hidden = state !== 'error';
  errorBox.textContent = state === 'error' ? message : '';
  if (state === 'loading' && message) loadingDetail.textContent = message;
  if (state !== 'ready') {
    clearTimeout(singleClickTimer);
    singleClickTimer = null;
    bubble.classList.remove('show');
    clearTimeout(idleTimer);
    idleTimer = undefined;
    pet.classList.remove(...allActions);
    clearTimeout(specialActionTimer);
    specialActionTimer = undefined;
    petEffect.className = 'pet-effect';
    petEffect.textContent = '';
  }
  if (state !== 'ready' && dragState) {
    cancelActiveDrag();
  }
  window.desktopPet.setReady(state === 'ready');
  if (state === 'ready') scheduleIdleAction();
  refreshMousePolicy();
}

function recoverUiAfter(delay, fallback = petForms.length > 0 ? 'ready' : 'empty') {
  clearTimeout(uiRecoveryTimer);
  uiRecoveryTimer = setTimeout(() => {
    uiRecoveryTimer = null;
    setUiState(fallback);
  }, delay);
}

function randomPhrase() {
  const photoPhrases = formMetadata[activeFormIndex]?.phrases;
  const phrases = photoPhrases?.length > 0
    ? photoPhrases
    : (customPhrases.length > 0
      ? customPhrases
      : (personalityPhrases[personality] || personalityPhrases.calm));
  if (phrases.length === 1) return phrases[0];
  let next = phrases[Math.floor(Math.random() * phrases.length)];
  while (next === lastPhrase) next = phrases[Math.floor(Math.random() * phrases.length)];
  lastPhrase = next;
  return next;
}

function showBubble(message = randomPhrase()) {
  clearTimeout(bubbleTimer);
  bubble.textContent = message;
  bubble.classList.remove('show', ...bubbleEffects);
  void bubble.offsetWidth;
  bubble.classList.add(bubbleEffects[Math.floor(Math.random() * bubbleEffects.length)]);
  bubble.classList.add('show');
  bubbleTimer = setTimeout(() => bubble.classList.remove('show'), 2300);
}

function resetSpecialAction() {
  clearTimeout(specialActionTimer);
  specialActionTimer = undefined;
  pet.classList.remove(...specialActions);
  petEffect.className = 'pet-effect';
  petEffect.textContent = '';
}

function interact() {
  resetSpecialAction();
  const animation = interactions[interactionIndex];
  interactionIndex = (interactionIndex + 1) % interactions.length;
  pet.classList.remove(...allActions);
  void pet.offsetWidth;
  pet.classList.add(animation);
  trackPetAnimationHitTest(1150);
  showBubble();
  scheduleIdleAction();
}

function playSpecialAction(action) {
  const settings = {
    eat: { className: 'special-eat', phrase: '好吃！再来一口～', duration: 1900 },
    cry: { className: 'special-cry', phrase: '呜呜……让我哭一会儿。', duration: 2400 },
    fall: { className: 'special-fall', phrase: '哎呀！摔倒了……', duration: 2100 },
    hop: { className: 'special-hop', phrase: '上蹿下跳！今天也要活力满满！', duration: 2300 },
    sleep: { className: 'special-sleep', phrase: '呼……让我睡一小会儿。', duration: 5200 },
  }[action];
  if (!settings || uiState !== 'ready') return;
  resetSpecialAction();
  pet.classList.remove(...allActions);
  petEffect.className = 'pet-effect';
  petEffect.textContent = '';
  void pet.offsetWidth;
  pet.classList.add(settings.className);
  petEffect.classList.add(`effect-${action}`);
  trackPetAnimationHitTest(settings.duration + 150);
  showBubble(settings.phrase);
  specialActionTimer = setTimeout(() => {
    pet.classList.remove(settings.className);
    petEffect.className = 'pet-effect';
    petEffect.textContent = '';
    specialActionTimer = undefined;
    scheduleIdleAction();
  }, settings.duration);
}

function scheduleIdleAction() {
  clearTimeout(idleTimer);
  if (uiState !== 'ready') return;
  idleTimer = setTimeout(runIdleAction, 6500 + Math.random() * 6500);
}

function runIdleAction() {
  if (uiState !== 'ready' || dragState || nativeMenuOpen || !bubbleEditor.hidden || specialActionTimer) {
    scheduleIdleAction();
    return;
  }
  const animation = idleActions[Math.floor(Math.random() * idleActions.length)];
  pet.classList.remove(...allActions);
  void pet.offsetWidth;
  pet.classList.add(animation);
  trackPetAnimationHitTest(2200);
  if (Math.random() < .3) showBubble();
  scheduleIdleAction();
}

function activatePetForm(index) {
  if (!Number.isInteger(index) || !petForms[index]) return false;
  activeFormIndex = index;
  activeGroupId = formMetadata[index]?.groupId || activeGroupId;
  const animationStartedAt = performance.now();
  pet.src = petForms[index];
  preparePetHitMask(petForms[index], index, animationStartedAt);
  updateAutoBubbleColor(petForms[index]);
  window.desktopPet.setActiveFormIndex(index, activeGroupId);
  return true;
}

function switchPetForm() {
  const groupForms = formMetadata
    .map((form, index) => (form.groupId === activeGroupId ? index : -1))
    .filter((index) => index >= 0);
  if (groupForms.length < 2) {
    showBubble('这个角色再添加一张照片，就能双击换形态啦！');
    return;
  }
  const position = groupForms.indexOf(activeFormIndex);
  activatePetForm(groupForms[(position + 1) % groupForms.length]);
  showBubble();
}

function registerPetClick() {
  if (singleClickTimer) {
    clearTimeout(singleClickTimer);
    singleClickTimer = null;
    switchPetForm();
    return;
  }

  singleClickTimer = setTimeout(() => {
    singleClickTimer = null;
    if (uiState === 'ready') interact();
  }, DOUBLE_CLICK_DELAY);
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('生成的透明图片无法读取'));
    image.src = dataUrl;
  });
}

function buildPetHitMaskFromImage(image) {
  const scale = Math.min(1, HIT_MASK_MAX_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  const alpha = new Uint8Array(width * height);
  for (let index = 0; index < alpha.length; index += 1) alpha[index] = rgba[index * 4 + 3];
  return { width, height, alpha, rgba };
}

async function buildPetHitMask(dataUrl) {
  return buildPetHitMaskFromImage(await loadImage(dataUrl));
}

function decodeAlphaFrame(base64) {
  const binary = atob(base64);
  const alpha = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) alpha[index] = binary.charCodeAt(index);
  return alpha;
}

function detectHeadProfile(mask) {
  const { width, height, alpha } = mask;
  const rowLeft = new Int32Array(height);
  const rowRight = new Int32Array(height);
  rowLeft.fill(width);
  rowRight.fill(-1);
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (alpha[row + x] < HIT_ALPHA_THRESHOLD) continue;
      rowLeft[y] = Math.min(rowLeft[y], x);
      rowRight[y] = Math.max(rowRight[y], x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (bottom < top) return { left: .08, top: .02, right: .92, bottom: .66 };

  const silhouetteHeight = bottom - top + 1;
  const spans = new Float32Array(height);
  const smoothRadius = Math.max(2, Math.round(silhouetteHeight * .012));
  for (let y = top; y <= bottom; y += 1) {
    let sum = 0;
    let samples = 0;
    for (let sampleY = Math.max(top, y - smoothRadius);
      sampleY <= Math.min(bottom, y + smoothRadius);
      sampleY += 1) {
      if (rowRight[sampleY] < 0) continue;
      sum += rowRight[sampleY] - rowLeft[sampleY] + 1;
      samples += 1;
    }
    spans[y] = samples > 0 ? sum / samples : 0;
  }

  const peakLimit = Math.min(bottom, top + Math.round(silhouetteHeight * .32));
  let headPeakY = top;
  for (let y = top; y <= peakLimit; y += 1) {
    if (spans[y] > spans[headPeakY]) headPeakY = y;
  }
  const headPeakWidth = spans[headPeakY];
  const searchStart = Math.max(
    headPeakY + Math.round(silhouetteHeight * .06),
    top + Math.round(silhouetteHeight * .14),
  );
  const searchEnd = Math.min(bottom, top + Math.round(silhouetteHeight * .5));
  let neckY = -1;
  let neckWidth = Number.POSITIVE_INFINITY;
  for (let y = searchStart; y <= searchEnd; y += 1) {
    const lookAhead = Math.min(bottom, y + Math.round(silhouetteHeight * .1));
    let followingWidth = spans[y];
    for (let nextY = y + 1; nextY <= lookAhead; nextY += 1) {
      followingWidth = Math.max(followingWidth, spans[nextY]);
    }
    if (spans[y] < neckWidth
      && spans[y] <= headPeakWidth * .72
      && followingWidth >= spans[y] * 1.22) {
      neckY = y;
      neckWidth = spans[y];
    }
  }

  const headBottom = neckY >= 0
    ? Math.min(bottom, neckY + Math.round(silhouetteHeight * .035))
    : Math.min(bottom, top + Math.round(silhouetteHeight * .66));
  let headLeft = width;
  let headRight = -1;
  for (let y = top; y <= headBottom; y += 1) {
    if (rowRight[y] < 0) continue;
    headLeft = Math.min(headLeft, rowLeft[y]);
    headRight = Math.max(headRight, rowRight[y]);
  }
  const marginX = Math.max(1, Math.round(width * .018));
  const marginY = Math.max(1, Math.round(height * .012));
  const imageProfile = {
    left: Math.max(0, headLeft - marginX) / width,
    top: Math.max(0, top - marginY) / height,
    right: Math.min(width, headRight + marginX + 1) / width,
    bottom: Math.min(height, headBottom + marginY + 1) / height,
  };

  const drawnWidth = width >= height ? 1 : width / height;
  const drawnHeight = height >= width ? 1 : height / width;
  const offsetX = (1 - drawnWidth) / 2;
  const offsetY = 1 - drawnHeight;
  return {
    left: offsetX + imageProfile.left * drawnWidth,
    top: offsetY + imageProfile.top * drawnHeight,
    right: offsetX + imageProfile.right * drawnWidth,
    bottom: offsetY + imageProfile.bottom * drawnHeight,
  };
}

function detectFaceLandmarks(mask, headProfile = detectHeadProfile(mask)) {
  const headWidth = headProfile.right - headProfile.left;
  const headHeight = headProfile.bottom - headProfile.top;
  const fallback = {
    leftEye: { x: headProfile.left + headWidth * .34, y: headProfile.top + headHeight * .62 },
    rightEye: { x: headProfile.left + headWidth * .66, y: headProfile.top + headHeight * .62 },
    mouth: { x: headProfile.left + headWidth * .5, y: headProfile.top + headHeight * .84 },
  };
  if (!mask.rgba) return fallback;

  const { width, height, rgba } = mask;
  const drawnWidth = width >= height ? 1 : width / height;
  const drawnHeight = height >= width ? 1 : height / width;
  const offsetX = (1 - drawnWidth) / 2;
  const offsetY = 1 - drawnHeight;
  const toRawX = (value) => Math.max(0, Math.min(width - 1,
    Math.round(((value - offsetX) / drawnWidth) * width)));
  const toRawY = (value) => Math.max(0, Math.min(height - 1,
    Math.round(((value - offsetY) / drawnHeight) * height)));
  const toElementPoint = (x, y) => ({
    x: offsetX + (x / width) * drawnWidth,
    y: offsetY + (y / height) * drawnHeight,
  });
  const rawHead = {
    left: toRawX(headProfile.left),
    right: toRawX(headProfile.right),
    top: toRawY(headProfile.top),
    bottom: toRawY(headProfile.bottom),
  };
  const rawWidth = Math.max(1, rawHead.right - rawHead.left);
  const rawHeight = Math.max(1, rawHead.bottom - rawHead.top);

  const weightedPoint = (zone, expected, scorePixel) => {
    let total = 0;
    let sumX = 0;
    let sumY = 0;
    const radiusX = Math.max(1, (zone.right - zone.left) * .58);
    const radiusY = Math.max(1, (zone.bottom - zone.top) * .58);
    for (let y = zone.top; y <= zone.bottom; y += 1) {
      for (let x = zone.left; x <= zone.right; x += 1) {
        const pixel = y * width + x;
        if (mask.alpha[pixel] < HIT_ALPHA_THRESHOLD) continue;
        const offset = pixel * 4;
        const colorScore = scorePixel(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
        if (colorScore <= 0) continue;
        const distance = ((x - expected.x) / radiusX) ** 2
          + ((y - expected.y) / radiusY) ** 2;
        const weight = colorScore * Math.max(.08, 1 - distance);
        total += weight;
        sumX += x * weight;
        sumY += y * weight;
      }
    }
    return total > 4 ? toElementPoint(sumX / total, sumY / total) : undefined;
  };

  const eyeTop = Math.round(rawHead.top + rawHeight * .42);
  const eyeBottom = Math.round(rawHead.top + rawHeight * .78);
  const eyeScore = (r, g, b) => {
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    const luma = r * .299 + g * .587 + b * .114;
    const darkness = Math.max(0, (172 - luma) / 172);
    const saturation = (maximum - minimum) / 255;
    return darkness ** 1.7 + saturation * .22;
  };
  const leftEye = weightedPoint({
    left: Math.round(rawHead.left + rawWidth * .16),
    right: Math.round(rawHead.left + rawWidth * .48),
    top: eyeTop,
    bottom: eyeBottom,
  }, {
    x: rawHead.left + rawWidth * .34,
    y: rawHead.top + rawHeight * .62,
  }, eyeScore) || fallback.leftEye;
  const rightEye = weightedPoint({
    left: Math.round(rawHead.left + rawWidth * .52),
    right: Math.round(rawHead.left + rawWidth * .84),
    top: eyeTop,
    bottom: eyeBottom,
  }, {
    x: rawHead.left + rawWidth * .66,
    y: rawHead.top + rawHeight * .62,
  }, eyeScore) || fallback.rightEye;
  const mouth = weightedPoint({
    left: Math.round(rawHead.left + rawWidth * .34),
    right: Math.round(rawHead.left + rawWidth * .66),
    top: Math.round(rawHead.top + rawHeight * .7),
    bottom: Math.round(rawHead.top + rawHeight * .96),
  }, {
    x: rawHead.left + rawWidth * .5,
    y: rawHead.top + rawHeight * .84,
  }, (r, g, b) => {
    const redness = Math.max(0, r - (g + b) * .48) / 255;
    const darkness = Math.max(0, (105 - (r + g + b) / 3) / 105);
    return redness * 1.7 + darkness * .18;
  }) || fallback.mouth;

  return { leftEye, rightEye, mouth };
}

function applyFaceLandmarks(mask, headProfile = activeHeadProfile) {
  const landmarks = detectFaceLandmarks(mask, headProfile);
  petPose.style.setProperty('--left-eye-x', `${landmarks.leftEye.x * 100}%`);
  petPose.style.setProperty('--left-eye-y', `${landmarks.leftEye.y * 100}%`);
  petPose.style.setProperty('--right-eye-x', `${landmarks.rightEye.x * 100}%`);
  petPose.style.setProperty('--right-eye-y', `${landmarks.rightEye.y * 100}%`);
  petPose.style.setProperty('--mouth-x', `${landmarks.mouth.x * 100}%`);
  petPose.style.setProperty('--mouth-y', `${landmarks.mouth.y * 100}%`);
}

function setDetectedHeadProfile(mask) {
  activeHeadProfile = detectHeadProfile(mask);
  applyFaceLandmarks(mask, activeHeadProfile);
  window.desktopPet.setHeadProfile?.(activeHeadProfile);
}

function preparePetHitMask(dataUrl, formIndex, animationStartedAt) {
  const request = ++hitMaskRequest;
  clearTimeout(animatedHitMaskTimer);
  animatedHitMaskTimer = undefined;
  activeHitMask = undefined;
  refreshMousePolicy();

  if (dataUrl.startsWith('data:image/gif;')) {
    window.desktopPet.loadAnimatedHitMasks(formIndex).then((animation) => {
      if (request !== hitMaskRequest) return;
      if (!animation?.frames?.length) {
        buildPetHitMask(dataUrl).then((mask) => {
          if (request !== hitMaskRequest) return;
          activeHitMask = mask;
          setDetectedHeadProfile(mask);
          refreshMousePolicy();
        });
        return;
      }
      const frames = animation.frames.map(decodeAlphaFrame);
      const profileAlpha = new Uint8Array(animation.width * animation.height);
      for (const frame of frames) {
        for (let index = 0; index < frame.length; index += 1) {
          if (frame[index] >= HIT_ALPHA_THRESHOLD) profileAlpha[index] = 255;
        }
      }
      setDetectedHeadProfile({ width: animation.width, height: animation.height, alpha: profileAlpha });
      buildPetHitMask(dataUrl).then((appearanceMask) => {
        if (request === hitMaskRequest) applyFaceLandmarks(appearanceMask, activeHeadProfile);
      }).catch(() => {});
      const delays = frames.map((_frame, index) => Math.max(20, animation.delays?.[index] || 100));
      const duration = delays.reduce((sum, delay) => sum + delay, 0);
      const syncAnimatedMask = () => {
        if (request !== hitMaskRequest) return;
        const cycleTime = ((performance.now() - animationStartedAt) % duration + duration) % duration;
        let frameIndex = 0;
        let frameEnd = delays[0];
        while (frameIndex < frames.length - 1 && cycleTime >= frameEnd) {
          frameIndex += 1;
          frameEnd += delays[frameIndex];
        }
        activeHitMask = {
          width: animation.width,
          height: animation.height,
          alpha: frames[frameIndex],
        };
        refreshMousePolicy();
        animatedHitMaskTimer = setTimeout(
          syncAnimatedMask,
          Math.max(16, Math.ceil(frameEnd - cycleTime)),
        );
      };
      syncAnimatedMask();
    }).catch((error) => {
      if (request !== hitMaskRequest) return;
      console.warn('无法读取 GIF 点击区域，将使用首帧', error);
      buildPetHitMask(dataUrl).then((mask) => {
        if (request !== hitMaskRequest) return;
        activeHitMask = mask;
        setDetectedHeadProfile(mask);
        refreshMousePolicy();
      });
    });
    return;
  }

  buildPetHitMask(dataUrl).then((mask) => {
    if (request !== hitMaskRequest) return;
    activeHitMask = mask;
    setDetectedHeadProfile(mask);
    refreshMousePolicy();
  }).catch((error) => {
    if (request !== hitMaskRequest) return;
    console.warn('无法建立桌宠点击区域', error);
    activeHitMask = undefined;
    refreshMousePolicy();
  });
}

function petLocalPoint(clientX, clientY) {
  const offsetParent = pet.offsetParent;
  if (!offsetParent) return null;
  const parentRect = offsetParent.getBoundingClientRect();
  let x = clientX - parentRect.left - pet.offsetLeft;
  let y = clientY - parentRect.top - pet.offsetTop;
  const style = getComputedStyle(pet);

  if (style.transform && style.transform !== 'none') {
    const origin = style.transformOrigin.split(/\s+/).map(Number.parseFloat);
    try {
      const point = new DOMPoint(x - origin[0], y - origin[1])
        .matrixTransform(new DOMMatrix(style.transform).inverse());
      x = point.x + origin[0];
      y = point.y + origin[1];
    } catch {
      return null;
    }
  }

  if (activeEdge === 'left') {
    const visualX = x;
    x = y;
    y = pet.clientWidth - visualX;
  } else if (activeEdge === 'right') {
    const visualX = x;
    x = pet.clientHeight - y;
    y = visualX;
  } else if (activeEdge === 'top') {
    x = pet.clientWidth - x;
    y = pet.clientHeight - y;
  }

  return { x, y };
}

function setPetEdge(state) {
  const edge = typeof state === 'string' ? state : state?.edge;
  const replay = typeof state === 'object' ? state.replay !== false : true;
  for (const name of ['left', 'right', 'top', 'bottom']) {
    petPose.classList.remove(`edge-${name}`);
  }
  activeEdge = ['left', 'right', 'top', 'bottom'].includes(edge) ? edge : undefined;
  const bubbleDirection = {
    left: 'right',
    right: 'left',
    top: 'down',
    bottom: 'up',
  }[activeEdge] || 'up';
  for (const direction of bubbleDirections) bubble.classList.remove(`bubble-direction-${direction}`);
  bubble.classList.add(`bubble-direction-${bubbleDirection}`);
  if (!activeEdge) return;
  if (replay) void petPose.offsetWidth;
  petPose.classList.add(`edge-${activeEdge}`);
  requestAnimationFrame(refreshMousePolicy);
}

function isOpaquePetPixel(clientX, clientY) {
  if (uiState !== 'ready' || pet.hidden || !activeHitMask) return false;
  const point = petLocalPoint(clientX, clientY);
  if (!point) return false;

  const elementWidth = pet.clientWidth;
  const elementHeight = pet.clientHeight;
  const scale = Math.min(
    elementWidth / activeHitMask.width,
    elementHeight / activeHitMask.height,
  );
  const drawnWidth = activeHitMask.width * scale;
  const drawnHeight = activeHitMask.height * scale;
  const imageX = point.x - (elementWidth - drawnWidth) / 2;
  const imageY = point.y - (elementHeight - drawnHeight);
  if (imageX < 0 || imageY < 0 || imageX >= drawnWidth || imageY >= drawnHeight) return false;

  const x = Math.min(activeHitMask.width - 1, Math.floor(imageX / scale));
  const y = Math.min(activeHitMask.height - 1, Math.floor(imageY / scale));
  return activeHitMask.alpha[y * activeHitMask.width + x] >= HIT_ALPHA_THRESHOLD;
}

function requiresWholeWindowInput() {
  return (
    dragState
    || nativeMenuOpen
    || !bubbleEditor.hidden
    || importInFlight
    || fileDragDepth > 0
  );
}

function setMousePassthrough(enabled) {
  const next = Boolean(enabled);
  if (mousePassthrough === next) return;
  mousePassthrough = next;
  window.desktopPet.setMousePassthrough(next);
}

function refreshMousePolicy() {
  if (requiresWholeWindowInput()) {
    setMousePassthrough(false);
    return;
  }
  if (uiState !== 'ready') {
    setMousePassthrough(false);
    return;
  }
  if (!lastPointer || !activeHitMask) {
    setMousePassthrough(true);
    return;
  }
  setMousePassthrough(!isOpaquePetPixel(lastPointer.x, lastPointer.y));
}

function trackPetAnimationHitTest(duration = 850) {
  hitTestTrackingUntil = Math.max(hitTestTrackingUntil, performance.now() + duration);
  if (hitTestAnimationFrame) return;
  const update = () => {
    hitTestAnimationFrame = undefined;
    refreshMousePolicy();
    if (performance.now() < hitTestTrackingUntil) {
      hitTestAnimationFrame = requestAnimationFrame(update);
    }
  };
  hitTestAnimationFrame = requestAnimationFrame(update);
}

async function preloadForms(forms) {
  await Promise.all(forms.map((form) => loadImage(form)));
}

async function replacePetForms(state) {
  const forms = Array.isArray(state?.forms) ? state.forms : [];
  if (forms.length === 0) {
    petForms = [];
    formMetadata = [];
    activeFormIndex = 0;
    hitMaskRequest += 1;
    clearTimeout(animatedHitMaskTimer);
    animatedHitMaskTimer = undefined;
    activeHitMask = undefined;
    pet.removeAttribute('src');
    setUiState('empty');
    return;
  }

  await preloadForms(forms);
  petForms = forms;
  formMetadata = Array.isArray(state?.formMetadata)
    ? state.formMetadata.map((form) => ({
      groupId: form?.groupId || 'default',
      phrases: Array.isArray(form?.phrases) ? form.phrases : [],
    }))
    : forms.map(() => ({ groupId: 'default', phrases: [] }));
  groups = Array.isArray(state?.groups) && state.groups.length > 0
    ? state.groups
    : [{ id: 'default', name: '角色 1' }];
  activeGroupId = typeof state?.activeGroupId === 'string'
    ? state.activeGroupId
    : formMetadata[state?.activeIndex]?.groupId || groups[0].id;
  const nextIndex = Number.isInteger(state?.activeIndex)
    ? Math.max(0, Math.min(forms.length - 1, state.activeIndex))
    : 0;
  activatePetForm(nextIndex);
  setUiState('ready');
}

async function trimTransparent(dataUrl) {
  if (dataUrl.startsWith('data:image/gif;')) return dataUrl;
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width;
  let right = -1;
  let top = canvas.height;
  let bottom = -1;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (pixels[(y * canvas.width + x) * 4 + 3] > 12) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (right < left || bottom < top) return dataUrl;

  const padding = Math.max(2, Math.round(Math.max(image.width, image.height) * 0.015));
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(canvas.width - 1, right + padding);
  bottom = Math.min(canvas.height - 1, bottom + padding);

  const cropped = document.createElement('canvas');
  cropped.width = right - left + 1;
  cropped.height = bottom - top + 1;
  cropped.getContext('2d').drawImage(
    canvas,
    left,
    top,
    cropped.width,
    cropped.height,
    0,
    0,
    cropped.width,
    cropped.height,
  );
  return cropped.toDataURL('image/png');
}

async function finishPhotoImport(results) {
  if (!results) {
    setUiState(petForms.length > 0 ? 'ready' : 'empty');
    return;
  }
  if (!Array.isArray(results) || results.length === 0) throw new Error('没有生成可用的桌宠形态');

  const newForms = [];
  for (let index = 0; index < results.length; index += 1) {
    loadingDetail.textContent = `正在整理第 ${index + 1}/${results.length} 张透明形态…`;
    newForms.push(await trimTransparent(results[index]));
  }

  const existingForms = petForms;
  const nextForms = [...existingForms, ...newForms];
  if (nextForms.length > 24) throw new Error('桌宠最多保留 24 个形态');

  await preloadForms(newForms);
  const groupId = groups.some((group) => group.id === pendingImportGroupId)
    ? pendingImportGroupId
    : (groups.some((group) => group.id === activeGroupId) ? activeGroupId : groups[0].id);
  const nextMetadata = [
    ...formMetadata,
    ...newForms.map(() => ({ groupId, phrases: [] })),
  ];
  activeGroupId = groupId;
  await window.desktopPet.saveForms({
    forms: nextForms,
    formMetadata: nextMetadata,
    groups,
    activeGroupId,
  });
  petForms = nextForms;
  formMetadata = nextMetadata;
  activatePetForm(existingForms.length);
  setUiState('ready');
  showBubble(petForms.length > 1 ? `新形态已加入，现在有 ${petForms.length} 个！` : randomPhrase());
}

async function importPhotos(action) {
  if (importInFlight) return;
  importInFlight = true;
  window.desktopPet.setAddingPhoto(true);
  setUiState('loading', '首次使用会下载约 176 MB 的本地抠图模型');
  try {
    await finishPhotoImport(await action());
  } catch (error) {
    console.error(error);
    setUiState('error', error.message || '抠图失败，请换一张主体清晰的原图。');
    recoverUiAfter(3600);
  } finally {
    pendingImportGroupId = undefined;
    importInFlight = false;
    window.desktopPet.setAddingPhoto(false);
    refreshMousePolicy();
  }
}

function choosePhotos(options) {
  pendingImportGroupId = options?.groupId;
  return importPhotos(() => window.desktopPet.choosePhotos());
}

document.addEventListener('dragenter', (event) => {
  event.preventDefault();
  fileDragDepth += 1;
  dropHint.hidden = false;
  window.desktopPet.setAddingPhoto(true);
  refreshMousePolicy();
});

document.addEventListener('dragover', (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});

document.addEventListener('dragleave', (event) => {
  fileDragDepth = Math.max(0, fileDragDepth - 1);
  if (fileDragDepth === 0) {
    dropHint.hidden = true;
    if (!importInFlight) window.desktopPet.setAddingPhoto(false);
    refreshMousePolicy();
  }
});

document.addEventListener('drop', (event) => {
  event.preventDefault();
  fileDragDepth = 0;
  dropHint.hidden = true;
  refreshMousePolicy();

  let droppedFiles = Array.from(event.dataTransfer.files);
  if (droppedFiles.length === 0) {
    droppedFiles = Array.from(event.dataTransfer.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter(Boolean);
  }
  const uriList = event.dataTransfer.getData('text/uri-list');
  if (droppedFiles.length === 0 && !uriList.includes('file://')) {
    window.desktopPet.setAddingPhoto(false);
    setUiState('error', '没有读取到图片；若聊天软件未提供文件，请先保存原图后再拖入。');
    recoverUiAfter(2600);
    return;
  }

  importPhotos(() => window.desktopPet.importDroppedPhotos(droppedFiles, uriList));
});

function cancelActiveDrag() {
  if (!dragState) return;
  const session = dragState;
  dragState = null;
  window.desktopPet.endDrag(session.id);
  if (session.handle.hasPointerCapture?.(session.pointerId)) {
    session.handle.releasePointerCapture(session.pointerId);
  }
  requestAnimationFrame(refreshMousePolicy);
}

function finishWindowDrag(event, cancelled = false) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const session = dragState;
  dragState = null;
  window.desktopPet.endDrag(session.id);
  if (session.handle.hasPointerCapture?.(session.pointerId)) {
    session.handle.releasePointerCapture(session.pointerId);
  }

  if (session.moved && session.kind === 'import') {
    suppressImportClickUntil = performance.now() + 200;
  }
  if (!cancelled && !session.moved && session.kind === 'pet') registerPetClick();
  requestAnimationFrame(refreshMousePolicy);
}

function startWindowDrag(event, kind) {
  if (event.button !== 0 || dragState) return;
  if (kind === 'pet' && uiState !== 'ready') return;
  if (kind === 'pet' && !isOpaquePetPixel(event.clientX, event.clientY)) return;
  if (kind === 'pet') resetSpecialAction();
  if (kind !== 'import') event.preventDefault();

  const handle = event.currentTarget;
  nextDragId = (nextDragId % Number.MAX_SAFE_INTEGER) + 1;
  dragState = {
    id: nextDragId,
    pointerId: event.pointerId,
    handle,
    kind,
    startX: event.screenX,
    startY: event.screenY,
    moved: false,
  };
  setMousePassthrough(false);
  handle.setPointerCapture(event.pointerId);
  if (kind === 'pet') {
    pet.classList.remove(...allActions);
    scheduleIdleAction();
  }
  window.desktopPet.beginDrag({ id: nextDragId });
}

function moveWindowDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  if ((event.buttons & 1) === 0) {
    finishWindowDrag(event, true);
    return;
  }

  if (!dragState.moved
    && Math.hypot(event.screenX - dragState.startX, event.screenY - dragState.startY) > DRAG_THRESHOLD) {
    dragState.moved = true;
    window.desktopPet.dragTo({ id: dragState.id });
  }
}

function attachWindowDrag(handle, kind = 'surface') {
  handle.addEventListener('pointerdown', (event) => startWindowDrag(event, kind));
  handle.addEventListener('pointermove', moveWindowDrag);
  handle.addEventListener('pointerup', (event) => finishWindowDrag(event));
  handle.addEventListener('pointercancel', (event) => finishWindowDrag(event, true));
  handle.addEventListener('lostpointercapture', (event) => finishWindowDrag(event, true));
}

function openBubbleEditor() {
  cancelActiveDrag();
  clearTimeout(singleClickTimer);
  singleClickTimer = null;
  customPhrasesInput.value = customPhrases.join('\n');
  bubbleColorMode.value = bubbleAppearance.colorMode;
  bubbleColorInput.value = bubbleAppearance.colorMode === 'auto'
    ? autoBubbleColor
    : bubbleAppearance.color;
  bubbleColorInput.disabled = bubbleAppearance.colorMode === 'auto';
  bubbleFontSelect.value = bubbleAppearance.font;
  bubbleStyleSelect.value = bubbleAppearance.style || 'glass';
  bubbleEditorStatus.textContent = '';
  bubbleEditor.hidden = false;
  refreshMousePolicy();
  customPhrasesInput.focus();
}

function closeBubbleEditor() {
  bubbleEditor.hidden = true;
  bubbleEditorStatus.textContent = '';
  applyBubbleAppearance();
  refreshMousePolicy();
}

function readBubbleAppearance() {
  return {
    colorMode: bubbleColorMode.value === 'custom' ? 'custom' : 'auto',
    color: /^#[0-9a-f]{6}$/i.test(bubbleColorInput.value)
      ? bubbleColorInput.value.toLowerCase()
      : '#ff9f72',
    font: bubbleFontStacks[bubbleFontSelect.value] ? bubbleFontSelect.value : 'system',
    style: bubbleStyles.has(bubbleStyleSelect.value) ? bubbleStyleSelect.value : 'glass',
  };
}

function previewBubbleAppearance() {
  bubbleColorInput.disabled = bubbleColorMode.value === 'auto';
  if (bubbleColorMode.value === 'auto') bubbleColorInput.value = autoBubbleColor;
  applyBubbleAppearance(readBubbleAppearance());
  if (uiState === 'ready') showBubble('气泡外观预览');
}

function readCustomPhrases() {
  const phrases = [...new Set(customPhrasesInput.value
    .split(/\r?\n/)
    .map((phrase) => phrase.trim())
    .filter(Boolean))];
  if (phrases.length > MAX_CUSTOM_PHRASE_COUNT) {
    throw new Error(`最多保存 ${MAX_CUSTOM_PHRASE_COUNT} 条自定义气泡`);
  }
  if (phrases.some((phrase) => phrase.length > MAX_CUSTOM_PHRASE_LENGTH)) {
    throw new Error(`每条气泡不能超过 ${MAX_CUSTOM_PHRASE_LENGTH} 个字符`);
  }
  return phrases;
}

async function saveCustomPhrases() {
  if (saveBubbleEditor.disabled) return;
  try {
    const phrases = readCustomPhrases();
    saveBubbleEditor.disabled = true;
    const result = await window.desktopPet.setBubbleSettings({
      phrases,
      appearance: readBubbleAppearance(),
    });
    customPhrases = result.phrases;
    bubbleAppearance = result.appearance;
    applyBubbleAppearance();
    lastPhrase = '';
    closeBubbleEditor();
    if (uiState === 'ready') {
      showBubble(customPhrases.length > 0 ? `已保存 ${customPhrases.length} 条自定义气泡` : randomPhrase());
    }
  } catch (error) {
    bubbleEditorStatus.textContent = error.message || '保存失败，请重试。';
  } finally {
    saveBubbleEditor.disabled = false;
  }
}

attachWindowDrag(pet, 'pet');
attachWindowDrag(importButton, 'import');
attachWindowDrag(loading);
attachWindowDrag(errorBox);
attachWindowDrag(bubbleEditorDragHandle);

document.addEventListener('contextmenu', async (event) => {
  if (!bubbleEditor.hidden) return;
  if (uiState === 'ready' && !isOpaquePetPixel(event.clientX, event.clientY)) return;
  event.preventDefault();
  nativeMenuOpen = true;
  refreshMousePolicy();
  try {
    const pointer = await window.desktopPet.showMenu();
    if (Number.isFinite(pointer?.x) && Number.isFinite(pointer?.y)) {
      lastPointer = { x: pointer.x, y: pointer.y };
    }
  } finally {
    nativeMenuOpen = false;
    refreshMousePolicy();
  }
});

pet.addEventListener('wheel', (event) => {
  if (!isOpaquePetPixel(event.clientX, event.clientY)) return;
  event.preventDefault();
  const nextSize = Math.max(120, Math.min(340, petSize + (event.deltaY < 0 ? 16 : -16)));
  if (nextSize !== petSize) {
    setPetSize(nextSize);
    window.desktopPet.setSize(nextSize);
  }
}, { passive: false });

importButton.addEventListener('click', (event) => {
  if (event.detail > 0 && performance.now() < suppressImportClickUntil) {
    event.preventDefault();
    return;
  }
  choosePhotos();
});
cancelBubbleEditor.addEventListener('click', closeBubbleEditor);
saveBubbleEditor.addEventListener('click', saveCustomPhrases);
customPhrasesInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeBubbleEditor();
  if (event.key === 'Enter' && event.ctrlKey) {
    event.preventDefault();
    saveCustomPhrases();
  }
});
bubbleColorMode.addEventListener('change', previewBubbleAppearance);
bubbleColorInput.addEventListener('input', previewBubbleAppearance);
bubbleFontSelect.addEventListener('change', previewBubbleAppearance);
bubbleStyleSelect.addEventListener('change', previewBubbleAppearance);
window.desktopPet.onChoosePhotos(choosePhotos);
window.desktopPet.onEditCustomPhrases(openBubbleEditor);
window.desktopPet.onActiveFormChanged((state) => {
  const index = Number.isInteger(state) ? state : state?.index;
  if (typeof state?.activeGroupId === 'string') activeGroupId = state.activeGroupId;
  if (activatePetForm(index) && uiState !== 'ready') setUiState('ready');
});
window.desktopPet.onFormsReplaced((state) => {
  replacePetForms(state).catch((error) => {
    console.error(error);
    setUiState('error', '更新桌宠照片失败，请重新打开软件。');
    recoverUiAfter(3000);
  });
});
window.desktopPet.onLibraryMetadataChanged((state) => {
  if (Array.isArray(state?.formMetadata) && state.formMetadata.length === petForms.length) {
    formMetadata = state.formMetadata;
  }
  if (Array.isArray(state?.groups) && state.groups.length > 0) groups = state.groups;
  if (typeof state?.activeGroupId === 'string') activeGroupId = state.activeGroupId;
  lastPhrase = '';
});
window.desktopPet.onSizeChanged(setPetSize);
window.desktopPet.onEdgeAction?.(setPetEdge);
window.desktopPet.onSpecialAction?.(playSpecialAction);
window.desktopPet.onModelProgress(({
  photoIndex,
  photoCount,
  frameIndex,
  frameCount,
  received,
  total,
}) => {
  const prefix = photoCount > 1 ? `第 ${photoIndex}/${photoCount} 张：` : '';
  if (frameCount > 1) {
    loadingDetail.textContent = `${prefix}正在处理 GIF 第 ${frameIndex}/${frameCount} 帧…`;
  } else if (total > 0) {
    const percent = Math.min(100, Math.round((received / total) * 100));
    loadingDetail.textContent = `${prefix}首次下载抠图模型 ${percent}%`;
  } else {
    loadingDetail.textContent = `${prefix}正在识别完整主体…`;
  }
});
window.desktopPet.onPersonalityChanged((nextPersonality) => {
  personality = nextPersonality;
  lastPhrase = '';
  if (uiState === 'ready') showBubble();
});

document.addEventListener('mousemove', (event) => {
  lastPointer = { x: event.clientX, y: event.clientY };
  // A press that started in an underlying app must also release there.
  if (mousePassthrough && event.buttons !== 0 && !dragState) return;
  refreshMousePolicy();
});
document.addEventListener('mouseleave', () => {
  lastPointer = undefined;
  refreshMousePolicy();
});

async function start() {
  try {
    const [state, saved] = await Promise.all([
      window.desktopPet.getState(),
      window.desktopPet.loadForms(),
    ]);
    setPetSize(state.petSize);
    personality = state.personality || 'calm';
    customPhrases = Array.isArray(state.customPhrases) ? state.customPhrases : [];
    bubbleAppearance = state.bubbleAppearance || bubbleAppearance;
    applyBubbleAppearance();
    petForms = saved.forms || [];
    formMetadata = Array.isArray(saved.formMetadata)
      ? saved.formMetadata
      : petForms.map(() => ({ groupId: 'default', phrases: [] }));
    groups = Array.isArray(saved.groups) && saved.groups.length > 0
      ? saved.groups
      : [{ id: 'default', name: '角色 1' }];
    activeGroupId = saved.activeGroupId || groups[0].id;
    if (petForms.length > 0) {
      await preloadForms(petForms);
      const firstInGroup = formMetadata.findIndex((form) => form.groupId === activeGroupId);
      activatePetForm(firstInGroup >= 0 ? firstInGroup : 0);
      setUiState('ready');
    } else {
      setUiState('empty');
    }
  } catch (error) {
    console.error(error);
    setUiState('error', '读取桌宠数据失败，请重新添加照片。');
    recoverUiAfter(3000, 'empty');
  }
}

start();
