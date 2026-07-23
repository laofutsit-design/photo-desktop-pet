const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const ort = require('onnxruntime-node');
const sharp = require('sharp');

const MODEL_URLS = [
  'https://hf-mirror.com/x-Liola-x/isnet-general-use-onnx/resolve/892a1bf4b12e74aa38a5e0d5e1e28ab9748beaed/isnet-general-use.onnx',
  'https://huggingface.co/x-Liola-x/isnet-general-use-onnx/resolve/892a1bf4b12e74aa38a5e0d5e1e28ab9748beaed/isnet-general-use.onnx?download=true',
];
const MODEL_SHA256 = '4c56bbc21588459dda11efba5a4a8ee163969da109ae170fb1988c1c2ea4a90a';
const MODEL_BYTES = 176213804;
const MODEL_SIZE = 1024;
const FOREGROUND_THRESHOLD = 0.5;
const DETAIL_FOREGROUND_THRESHOLD = 0.18;
const RELAXED_FOREGROUND_THRESHOLD = 0.05;
const MIN_CONFIDENT_FOREGROUND_RATIO = 0.02;
const MIN_RELAXED_FOREGROUND_RATIO = 0.05;
const MIN_RELAXED_FOREGROUND_GROWTH = 5;
const MASK_CLOSE_RADIUS = 2;
const MAX_GIF_FRAMES = 300;

let sessionPromise;

function clampProbability(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function morphMask(mask, width, height, radius, dilate) {
  const horizontal = new Uint8Array(mask.length);
  const output = new Uint8Array(mask.length);
  const fullWindow = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let count = 0;
    for (let x = 0; x <= radius && x < width; x += 1) count += mask[row + x];

    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = dilate ? Number(count > 0) : Number(count === fullWindow);
      const removeX = x - radius;
      const addX = x + radius + 1;
      if (removeX >= 0) count -= mask[row + removeX];
      if (addX < width) count += mask[row + addX];
    }
  }

  for (let x = 0; x < width; x += 1) {
    let count = 0;
    for (let y = 0; y <= radius && y < height; y += 1) count += horizontal[y * width + x];

    for (let y = 0; y < height; y += 1) {
      const index = y * width + x;
      output[index] = dilate ? Number(count > 0) : Number(count === fullWindow);
      const removeY = y - radius;
      const addY = y + radius + 1;
      if (removeY >= 0) count -= horizontal[removeY * width + x];
      if (addY < height) count += horizontal[addY * width + x];
    }
  }

  return output;
}

function closeMask(mask, width, height, radius) {
  return morphMask(
    morphMask(mask, width, height, radius, true),
    width,
    height,
    radius,
    false,
  );
}

function fillMaskHoles(mask, width, height) {
  const exterior = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;

  const addExterior = (index) => {
    if (mask[index] || exterior[index]) return;
    exterior[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    addExterior(x);
    addExterior((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    addExterior(y * width);
    addExterior(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    if (index >= width) addExterior(index - width);
    if (index < mask.length - width) addExterior(index + width);
    if (x > 0) addExterior(index - 1);
    if (x < width - 1) addExterior(index + 1);
  }

  const filled = new Uint8Array(mask.length);
  for (let index = 0; index < mask.length; index += 1) {
    filled[index] = Number(mask[index] || !exterior[index]);
  }
  return filled;
}

function keepRelevantComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components = [];

  const visitComponent = (seed, output) => {
    let head = 0;
    let tail = 1;
    queue[0] = seed;
    output[seed] = 1;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    while (head < tail) {
      const index = queue[head];
      head += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const add = (next) => {
        if (next < 0 || next >= mask.length || !mask[next] || output[next]) return;
        output[next] = 1;
        queue[tail] = next;
        tail += 1;
      };
      if (index >= width) add(index - width);
      if (index < mask.length - width) add(index + width);
      if (x > 0) add(index - 1);
      if (x < width - 1) add(index + 1);
    }
    return { seed, size: tail, minX, minY, maxX, maxY };
  };

  for (let seed = 0; seed < mask.length; seed += 1) {
    if (!mask[seed] || visited[seed]) continue;
    components.push(visitComponent(seed, visited));
  }

  if (components.length === 0) return new Uint8Array(mask.length);
  const largest = components.reduce((best, item) => (item.size > best.size ? item : best));
  const minimumSize = Math.max(12, Math.round(largest.size * .0015));
  const nearbyDistance = Math.max(width, height) * .055;
  const output = new Uint8Array(mask.length);

  for (const component of components) {
    const horizontalGap = Math.max(
      0,
      largest.minX - component.maxX - 1,
      component.minX - largest.maxX - 1,
    );
    const verticalGap = Math.max(
      0,
      largest.minY - component.maxY - 1,
      component.minY - largest.maxY - 1,
    );
    const isNearby = Math.hypot(horizontalGap, verticalGap) <= nearbyDistance;
    const isSubstantial = component.size >= largest.size * .02;
    if (component !== largest
      && (component.size < minimumSize || (!isNearby && !isSubstantial))) continue;
    visitComponent(component.seed, output);
  }
  return output;
}

function buildSilhouette(detailed, width, height, threshold) {
  const foreground = new Uint8Array(width * height);
  for (let index = 0; index < foreground.length; index += 1) {
    foreground[index] = Number(
      clampProbability(detailed[index]) >= threshold,
    );
  }

  const closed = closeMask(foreground, width, height, MASK_CLOSE_RADIUS);
  return keepRelevantComponents(fillMaskHoles(closed, width, height), width, height);
}

function maskSize(mask) {
  let size = 0;
  for (const value of mask) size += value;
  return size;
}

function buildAlphaMask(detailed, width, height) {
  let silhouette = buildSilhouette(detailed, width, height, FOREGROUND_THRESHOLD);
  const pixelCount = width * height;
  const confidentSize = maskSize(silhouette);
  const detailedSilhouette = buildSilhouette(detailed, width, height, DETAIL_FOREGROUND_THRESHOLD);
  const detailedSize = maskSize(detailedSilhouette);

  if (detailedSize >= confidentSize
    && detailedSize <= Math.max(confidentSize * 1.55, confidentSize + pixelCount * .04)) {
    silhouette = detailedSilhouette;
  }

  if (maskSize(silhouette) / pixelCount < MIN_CONFIDENT_FOREGROUND_RATIO) {
    const relaxed = buildSilhouette(detailed, width, height, RELAXED_FOREGROUND_THRESHOLD);
    const relaxedSize = maskSize(relaxed);
    if (relaxedSize / pixelCount >= MIN_RELAXED_FOREGROUND_RATIO
      && relaxedSize >= confidentSize * MIN_RELAXED_FOREGROUND_GROWTH) {
      silhouette = relaxed;
    }
  }

  const alpha = Buffer.alloc(width * height);
  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = silhouette[index] ? 255 : 0;
  }
  return alpha;
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function hasValidModel(modelPath) {
  try {
    const stat = await fsp.stat(modelPath);
    return stat.size === MODEL_BYTES && await hashFile(modelPath) === MODEL_SHA256;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function downloadModel(url, tempPath, onProgress) {
  const controller = new AbortController();
  const connectTimer = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(connectTimer);
  }

  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const file = await fsp.open(tempPath, 'w');
  const hash = crypto.createHash('sha256');
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      await file.write(chunk);
      hash.update(chunk);
      received += chunk.length;
      onProgress?.(received, MODEL_BYTES);
    }
  } finally {
    await file.close();
  }

  if (received !== MODEL_BYTES || hash.digest('hex') !== MODEL_SHA256) {
    throw new Error('模型文件校验失败');
  }
}

async function ensureModel(modelPath, fallbackModelPath, onProgress) {
  if (await hasValidModel(modelPath)) return modelPath;

  const writablePath = fallbackModelPath || modelPath;
  if (writablePath !== modelPath && await hasValidModel(writablePath)) return writablePath;

  await fsp.mkdir(path.dirname(writablePath), { recursive: true });
  const tempPath = `${writablePath}.${process.pid}.${crypto.randomUUID()}.download`;
  let lastError;

  for (const url of MODEL_URLS) {
    try {
      await downloadModel(url, tempPath, onProgress);
      await fsp.unlink(writablePath).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
      await fsp.rename(tempPath, writablePath);
      return writablePath;
    } catch (error) {
      lastError = error;
      await fsp.unlink(tempPath).catch(() => {});
    }
  }

  throw new Error(`抠图模型下载失败：${lastError?.message || '网络不可用'}`);
}

async function getSession(modelPath, fallbackModelPath, onProgress) {
  if (!sessionPromise) {
    sessionPromise = ensureModel(modelPath, fallbackModelPath, onProgress)
      .then((resolvedPath) => ort.InferenceSession.create(resolvedPath, {
        executionMode: 'parallel',
        graphOptimizationLevel: 'all',
      }))
      .catch((error) => {
        sessionPromise = undefined;
        throw error;
      });
  }
  return sessionPromise;
}

async function inferFrameMask(session, rgba, width, height) {
  const resized = await sharp(rgba, {
    raw: { width, height, channels: 4 },
  })
    .removeAlpha()
    .resize(MODEL_SIZE, MODEL_SIZE, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer();

  const planeSize = MODEL_SIZE * MODEL_SIZE;
  const tensorData = new Float32Array(planeSize * 3);
  for (let pixel = 0; pixel < planeSize; pixel += 1) {
    const source = pixel * 3;
    tensorData[pixel] = resized[source] / 255 - 0.5;
    tensorData[pixel + planeSize] = resized[source + 1] / 255 - 0.5;
    tensorData[pixel + planeSize * 2] = resized[source + 2] / 255 - 0.5;
  }

  const feeds = {
    [session.inputNames[0]]: new ort.Tensor('float32', tensorData, [1, 3, MODEL_SIZE, MODEL_SIZE]),
  };
  const result = await session.run(feeds, [session.outputNames[0]]);
  const detailed = result.output?.data || result[session.outputNames[0]].data;

  const mask = buildAlphaMask(detailed, MODEL_SIZE, MODEL_SIZE);
  const resizedMask = await sharp(mask, {
    raw: { width: MODEL_SIZE, height: MODEL_SIZE, channels: 1 },
  })
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
    .greyscale()
    .raw()
    .toBuffer();
  const fullSizeMask = Buffer.alloc(width * height);
  for (let pixel = 0; pixel < fullSizeMask.length; pixel += 1) {
    fullSizeMask[pixel] = resizedMask[pixel] >= 160 && rgba[pixel * 4 + 3] >= 32 ? 255 : 0;
  }
  return fullSizeMask;
}

function isInteriorMaskPixel(mask, x, y, width, height) {
  if (x <= 0 || y <= 0 || x >= width - 1 || y >= height - 1) return false;
  for (let sampleY = y - 1; sampleY <= y + 1; sampleY += 1) {
    for (let sampleX = x - 1; sampleX <= x + 1; sampleX += 1) {
      if (mask[sampleY * width + sampleX] === 0) return false;
    }
  }
  return true;
}

function applyFrameMask(rgba, fullSizeMask, width, height) {
  const output = Buffer.from(rgba);

  for (let pixel = 0; pixel < fullSizeMask.length; pixel += 1) {
    const offset = pixel * 4;
    if (fullSizeMask[pixel] === 0) output.fill(0, offset, offset + 4);
    else output[offset + 3] = 255;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (fullSizeMask[pixel] === 0 || isInteriorMaskPixel(fullSizeMask, x, y, width, height)) {
        continue;
      }
      let sourcePixel = -1;
      for (let radius = 1; radius <= 3 && sourcePixel < 0; radius += 1) {
        for (let sampleY = Math.max(1, y - radius);
          sampleY <= Math.min(height - 2, y + radius) && sourcePixel < 0;
          sampleY += 1) {
          for (let sampleX = Math.max(1, x - radius);
            sampleX <= Math.min(width - 2, x + radius);
            sampleX += 1) {
            const candidate = sampleY * width + sampleX;
            if (isInteriorMaskPixel(fullSizeMask, sampleX, sampleY, width, height)) {
              sourcePixel = candidate;
              break;
            }
          }
        }
      }
      if (sourcePixel >= 0) {
        const target = pixel * 4;
        const source = sourcePixel * 4;
        output[target] = output[source];
        output[target + 1] = output[source + 1];
        output[target + 2] = output[source + 2];
      }
    }
  }
  return output;
}

async function removeFrameBackground(session, rgba, width, height) {
  return applyFrameMask(rgba, await inferFrameMask(session, rgba, width, height), width, height);
}

function stabilizeGifMask(previous, current, next, width, rgba) {
  if (!previous || !next) return current;
  const stable = Buffer.from(current);
  const isolated = new Uint8Array(current.length);
  for (let pixel = 0; pixel < current.length; pixel += 1) {
    if (current[pixel] === 0 && previous[pixel] && next[pixel] && rgba[pixel * 4 + 3] >= 32) {
      stable[pixel] = 255;
    }
    else if (current[pixel] && !previous[pixel] && !next[pixel]) isolated[pixel] = 1;
  }

  const visited = new Uint8Array(current.length);
  const queue = new Int32Array(current.length);
  const smallRegionLimit = Math.max(12, Math.round(current.length * .00008));
  for (let seed = 0; seed < isolated.length; seed += 1) {
    if (!isolated[seed] || visited[seed]) continue;
    let head = 0;
    let tail = 1;
    queue[0] = seed;
    visited[seed] = 1;
    while (head < tail) {
      const index = queue[head];
      head += 1;
      const x = index % width;
      const add = (value) => {
        if (value < 0 || value >= isolated.length || !isolated[value] || visited[value]) return;
        visited[value] = 1;
        queue[tail] = value;
        tail += 1;
      };
      if (index >= width) add(index - width);
      if (index < isolated.length - width) add(index + width);
      if (x > 0) add(index - 1);
      if (x < width - 1) add(index + 1);
    }
    if (tail <= smallRegionLimit) {
      for (let index = 0; index < tail; index += 1) stable[queue[index]] = 0;
    }
  }
  return stable;
}

function cropAnimatedFrames(frames, width, height) {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (const frame of frames) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (frame[(y * width + x) * 4 + 3] === 0) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (right < left || bottom < top) return { frames, width, height };
  const croppedWidth = right - left + 1;
  const croppedHeight = bottom - top + 1;
  const croppedFrames = frames.map((frame) => {
    const cropped = Buffer.alloc(croppedWidth * croppedHeight * 4);
    for (let y = 0; y < croppedHeight; y += 1) {
      const sourceStart = ((top + y) * width + left) * 4;
      const targetStart = y * croppedWidth * 4;
      frame.copy(cropped, targetStart, sourceStart, sourceStart + croppedWidth * 4);
    }
    return cropped;
  });
  return { frames: croppedFrames, width: croppedWidth, height: croppedHeight };
}

async function removeAnimatedGif(input, metadata, session, options) {
  const pageCount = metadata.pages || 1;
  if (pageCount > MAX_GIF_FRAMES) {
    throw new Error(`GIF 最多支持 ${MAX_GIF_FRAMES} 帧，当前有 ${pageCount} 帧`);
  }

  const decoded = await sharp(input, { animated: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pageHeight = decoded.info.pageHeight || metadata.pageHeight
    || Math.floor(decoded.info.height / pageCount);
  const frameBytes = decoded.info.width * pageHeight * 4;
  const frames = [];
  let previousMask;
  let currentMask;
  let currentFrame;

  for (let frameIndex = 0; frameIndex < pageCount; frameIndex += 1) {
    options.onFrameProgress?.(frameIndex + 1, pageCount);
    const start = frameIndex * frameBytes;
    const nextFrame = decoded.data.subarray(start, start + frameBytes);
    const nextMask = await inferFrameMask(
      session,
      nextFrame,
      decoded.info.width,
      pageHeight,
    );
    if (currentMask) {
      frames.push(applyFrameMask(
        currentFrame,
        stabilizeGifMask(previousMask, currentMask, nextMask, decoded.info.width, currentFrame),
        decoded.info.width,
        pageHeight,
      ));
    }
    previousMask = currentMask;
    currentMask = nextMask;
    currentFrame = nextFrame;
  }
  frames.push(applyFrameMask(currentFrame, currentMask, decoded.info.width, pageHeight));

  const cropped = cropAnimatedFrames(frames, decoded.info.width, pageHeight);
  const delays = Array.from({ length: pageCount }, (_value, index) => (
    metadata.delay?.[index] ?? metadata.delay?.at(-1) ?? 100
  ));
  return sharp(Buffer.concat(cropped.frames), {
    raw: {
      width: cropped.width,
      height: cropped.height * pageCount,
      pageHeight: cropped.height,
      channels: 4,
    },
  }).gif({
    loop: metadata.loop ?? 0,
    delay: delays,
    effort: 7,
    dither: 0,
    reuse: false,
    interFrameMaxError: 0,
    interPaletteMaxError: 0,
    keepDuplicateFrames: true,
  }).toBuffer();
}

async function removeBackground(input, options) {
  const metadata = await sharp(input, { animated: true }).metadata();
  const session = await getSession(
    options.modelPath,
    options.fallbackModelPath,
    options.onProgress,
  );
  if (metadata.format === 'gif' && (metadata.pages || 1) > 1) {
    return removeAnimatedGif(input, metadata, session, options);
  }

  const original = await sharp(input)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = await removeFrameBackground(
    session,
    original.data,
    original.info.width,
    original.info.height,
  );

  return sharp(output, {
    raw: {
      width: original.info.width,
      height: original.info.height,
      channels: 4,
    },
  }).png().toBuffer();
}

module.exports = { removeBackground };
