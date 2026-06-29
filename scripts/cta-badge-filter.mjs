const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 1792;

export function buildCtaTextBadgeFilter(cta) {
  const fontSize = Math.round(58 * (cta.scale / 100));
  const box = getBadgeBox(cta, fontSize);
  const x = Math.round(CANVAS_WIDTH * (cta.x / 100));
  const y = Math.round(CANVAS_HEIGHT * (cta.y / 100));
  const opacity = (cta.opacity / 100).toFixed(2);
  const outerMask = roundedRectAlpha(box.width, box.height, box.radius);
  const innerMask = roundedRectAlpha(box.innerWidth, box.innerHeight, box.innerRadius);

  return [
    `color=c=${getCtaBorderColor(cta)}:s=${box.width}x${box.height}:d=5,format=rgba,${alphaMaskFilter(outerMask)}[ctaOuter]`,
    `color=c=${getCtaBoxColor(cta)}:s=${box.innerWidth}x${box.innerHeight}:d=5,format=rgba,${alphaMaskFilter(innerMask)}[ctaInner]`,
    `[ctaOuter][ctaInner]overlay=x=${box.border}:y=${box.border}:format=auto[ctaBg]`,
    `[ctaBg]drawtext=text='${escapeFfmpegText(cta.text)}':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=${fontSize}:fontcolor=${getCtaTextColor(cta)}[ctaText]`,
    `[ctaText]colorchannelmixer=aa=${opacity}[cta]`,
    `[base][cta]overlay=x=${x}-w/2:y=${y}-h/2:enable='gte(t,3)',format=yuv420p[out]`
  ].join(";");
}

function alphaMaskFilter(mask) {
  return `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${mask}'`;
}

function getBadgeBox(cta, fontSize) {
  const border = Math.max(3, Math.round(4 * (cta.scale / 100)));
  const horizontalPadding = Math.round(48 * (cta.scale / 100));
  const verticalPadding = Math.round(28 * (cta.scale / 100));
  const textWidth = estimateTextWidth(cta.text, fontSize);
  const width = clampNumber(textWidth + horizontalPadding * 2, 360, 880);
  const height = clampNumber(fontSize + verticalPadding * 2, 96, 170);
  const radius = clampNumber(Math.round((cta.badge?.radius ?? cta.radius) * (cta.scale / 100)), 0, Math.floor(height / 2));
  return {
    border,
    width,
    height,
    radius,
    innerWidth: width - border * 2,
    innerHeight: height - border * 2,
    innerRadius: Math.max(0, radius - border)
  };
}

function estimateTextWidth(text, fontSize) {
  return Math.round(String(text || "").length * fontSize * 0.62);
}

function roundedRectAlpha(width, height, radius) {
  if (radius <= 0) return "255";
  const right = width - radius - 1;
  const bottom = height - radius - 1;
  const tests = [
    `between(X,${radius},${right})`,
    `between(Y,${radius},${bottom})`,
    `lte(pow(X-${radius},2)+pow(Y-${radius},2),${radius * radius})`,
    `lte(pow(X-${right},2)+pow(Y-${radius},2),${radius * radius})`,
    `lte(pow(X-${radius},2)+pow(Y-${bottom},2),${radius * radius})`,
    `lte(pow(X-${right},2)+pow(Y-${bottom},2),${radius * radius})`,
  ];
  return `if(gt(${tests.join("+")},0),255,0)`;
}

function getCtaBoxColor(cta) {
  return toFfmpegColor(cta.badge?.background || cta.background, "white");
}

function getCtaBorderColor(cta) {
  return toFfmpegColor(cta.badge?.border || cta.border, "black");
}

function getCtaTextColor(cta) {
  return toFfmpegColor(cta.badge?.color || cta.color, "black");
}

function toFfmpegColor(value, fallback) {
  const normalized = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized.replace("#", "0x");
  return fallback;
}

function escapeFfmpegText(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(value)));
}
