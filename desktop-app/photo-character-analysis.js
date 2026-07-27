(function attachPhotoCharacterAnalysis(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PhotoCharacterAnalysis = api;
}(typeof window === 'object' ? window : globalThis, () => {
  'use strict';

  const COLOR_BINS = 40;
  const LUMA_BINS = 8;
  const VERTICAL_BANDS = 3;
  const SILHOUETTE_ROWS = 12;
  const MIN_ALPHA = 96;

  function normalize(values) {
    const total = values.reduce((sum, value) => sum + value, 0);
    return total > 0 ? values.map((value) => value / total) : values;
  }

  function colorBin(r, g, b) {
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    const delta = maximum - minimum;
    const saturation = maximum === 0 ? 0 : delta / maximum;
    if (saturation < .12) {
      return 36 + Math.min(3, Math.floor((maximum / 256) * 4));
    }
    let hue;
    if (maximum === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    else if (maximum === g) hue = ((b - r) / delta + 2) / 6;
    else hue = ((r - g) / delta + 4) / 6;
    const hueBin = Math.min(11, Math.floor(hue * 12));
    const saturationBin = Math.min(2, Math.floor(saturation * 3));
    return hueBin * 3 + saturationBin;
  }

  function addSoftLuma(histogram, luma, weight) {
    const position = Math.max(0, Math.min(LUMA_BINS - 1, (luma / 255) * (LUMA_BINS - 1)));
    const lower = Math.floor(position);
    const upper = Math.min(LUMA_BINS - 1, lower + 1);
    const fraction = position - lower;
    histogram[lower] += weight * (1 - fraction);
    histogram[upper] += weight * fraction;
  }

  function createCharacterDescriptor(rgba, width, height) {
    if (!rgba || width < 1 || height < 1 || rgba.length < width * height * 4) return null;
    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;
    let opaquePixels = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = rgba[(y * width + x) * 4 + 3];
        if (alpha < MIN_ALPHA) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        opaquePixels += 1;
      }
    }
    if (right < left || bottom < top || opaquePixels < 16) return null;

    const boxWidth = right - left + 1;
    const boxHeight = bottom - top + 1;
    const colors = Array(COLOR_BINS).fill(0);
    const luma = Array(LUMA_BINS).fill(0);
    const bands = Array.from(
      { length: VERTICAL_BANDS },
      () => Array(COLOR_BINS).fill(0),
    );
    const silhouette = Array(SILHOUETTE_ROWS).fill(0);

    for (let y = top; y <= bottom; y += 1) {
      const normalizedY = (y - top) / Math.max(1, boxHeight - 1);
      const band = Math.min(VERTICAL_BANDS - 1, Math.floor(normalizedY * VERTICAL_BANDS));
      const row = Math.min(SILHOUETTE_ROWS - 1, Math.floor(normalizedY * SILHOUETTE_ROWS));
      let rowPixels = 0;
      for (let x = left; x <= right; x += 1) {
        const offset = (y * width + x) * 4;
        const alpha = rgba[offset + 3];
        if (alpha < MIN_ALPHA) continue;
        const weight = alpha / 255;
        const red = rgba[offset];
        const green = rgba[offset + 1];
        const blue = rgba[offset + 2];
        const bin = colorBin(red, green, blue);
        colors[bin] += weight;
        bands[band][bin] += weight;
        addSoftLuma(luma, red * .299 + green * .587 + blue * .114, weight);
        rowPixels += weight;
      }
      silhouette[row] += rowPixels / boxWidth;
    }

    return {
      colors: normalize(colors),
      luma: normalize(luma),
      bands: bands.map(normalize),
      silhouette: normalize(silhouette),
      aspect: boxWidth / boxHeight,
      occupancy: opaquePixels / (boxWidth * boxHeight),
    };
  }

  function histogramIntersection(left, right) {
    if (!left?.length || left.length !== right?.length) return 0;
    let score = 0;
    for (let index = 0; index < left.length; index += 1) {
      score += Math.min(left[index], right[index]);
    }
    return Math.max(0, Math.min(1, score));
  }

  function cosineSimilarity(left, right) {
    if (!left?.length || left.length !== right?.length) return 0;
    let product = 0;
    let leftLength = 0;
    let rightLength = 0;
    for (let index = 0; index < left.length; index += 1) {
      product += left[index] * right[index];
      leftLength += left[index] ** 2;
      rightLength += right[index] ** 2;
    }
    if (leftLength === 0 || rightLength === 0) return 0;
    return product / Math.sqrt(leftLength * rightLength);
  }

  function ratioSimilarity(left, right, spread) {
    if (!(left > 0) || !(right > 0)) return 0;
    return Math.max(0, 1 - Math.abs(Math.log(left / right)) / spread);
  }

  function characterSimilarity(left, right) {
    if (!left || !right) return 0;
    const globalColor = histogramIntersection(left.colors, right.colors);
    const bandColor = left.bands.reduce(
      (sum, band, index) => sum + histogramIntersection(band, right.bands[index]),
      0,
    ) / VERTICAL_BANDS;
    const silhouette = cosineSimilarity(left.silhouette, right.silhouette);
    const luma = histogramIntersection(left.luma, right.luma);
    const proportions = (
      ratioSimilarity(left.aspect, right.aspect, 1.2)
      + ratioSimilarity(left.occupancy, right.occupancy, 1.4)
    ) / 2;
    return Math.max(
      0,
      Math.min(
        1,
        globalColor * .48 + bandColor * .26 + luma * .08 + silhouette * .1 + proportions * .08,
      ),
    );
  }

  function rankCharacterGroups(descriptor, groupDescriptors) {
    const ranked = [];
    for (const [groupId, descriptors] of groupDescriptors) {
      const scores = descriptors
        .map((candidate) => characterSimilarity(descriptor, candidate))
        .sort((left, right) => right - left);
      if (scores.length === 0) continue;
      const score = scores.length > 1 ? scores[0] * .72 + scores[1] * .28 : scores[0];
      ranked.push({ groupId, score });
    }
    return ranked.sort((left, right) => right.score - left.score);
  }

  function matchingCharacterGroup(descriptor, groupDescriptors) {
    const ranked = rankCharacterGroups(descriptor, groupDescriptors);
    const best = ranked[0];
    if (!best) return null;
    const runnerUp = ranked[1]?.score || 0;
    const confident = best.score >= .97
      || (best.score >= .91 && best.score - runnerUp >= .025)
      || (best.score >= .82 && best.score - runnerUp >= .055)
      || (ranked.length === 1 && best.score >= .83);
    return confident ? best : null;
  }

  return {
    createCharacterDescriptor,
    characterSimilarity,
    matchingCharacterGroup,
    rankCharacterGroups,
  };
}));
