import type { GenerateRequestBody } from "@/lib/types";

function hashText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function createMockSvg(payload: GenerateRequestBody): string {
  const width = 960;
  const height = 640;

  const baseSeed = hashText(
    [payload.prompt, payload.illustrationType, payload.style, payload.complexity, payload.palette.primary, payload.palette.secondary, payload.palette.accent].join("|"),
  );

  const shapeCount = payload.complexity === "simple" ? 4 : payload.complexity === "medium" ? 7 : 11;
  const accentColor = payload.palette.monochrome ? payload.palette.primary : payload.palette.accent;
  const secondaryColor = payload.palette.monochrome ? payload.palette.primary : payload.palette.secondary;
  const safePrompt = escapeXml(payload.prompt.slice(0, 86));

  const shapes = Array.from({ length: shapeCount })
    .map((_, index) => {
      const seed = baseSeed + index * 197;
      const x = (seed % 86) + 6;
      const y = ((seed >> 4) % 76) + 8;
      const radius = (seed % 24) + 8;
      const opacity = 0.08 + ((seed % 50) / 100);
      return `<circle cx="${x}%" cy="${y}%" r="${radius}" fill="${index % 2 ? secondaryColor : accentColor}" opacity="${opacity.toFixed(2)}" />`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Mock illustration output">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${payload.palette.primary}" />
      <stop offset="100%" stop-color="${secondaryColor}" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" />
  <rect x="56" y="56" rx="28" ry="28" width="${width - 112}" height="${height - 112}" fill="rgba(0, 0, 0, 0.18)" stroke="rgba(255,255,255,0.32)" />
  ${shapes}
  <g fill="white">
    <text x="96" y="${height - 132}" font-size="20" font-family="Arial, Helvetica, sans-serif" opacity="0.85">${escapeXml(payload.illustrationType)} / ${escapeXml(
      payload.style,
    )} / ${escapeXml(payload.complexity)}</text>
    <text x="96" y="${height - 90}" font-size="30" font-weight="600" font-family="Arial, Helvetica, sans-serif">${safePrompt || "IllustrateLab mock output"}</text>
    <text x="96" y="${height - 52}" font-size="16" font-family="Arial, Helvetica, sans-serif" opacity="0.9">Mode: mock</text>
  </g>
</svg>`;
}

export function createMockSvgFromSource(payload: GenerateRequestBody, sourceImageDataUrl: string): string {
  const width = 960;
  const height = 640;
  const inset = 64;
  const imageWidth = width - inset * 2;
  const imageHeight = height - inset * 2;

  const baseSeed = hashText(
    [payload.prompt, payload.illustrationType, payload.style, payload.complexity, payload.palette.primary, payload.palette.secondary, payload.palette.accent].join("|"),
  );

  const accentColor = payload.palette.monochrome ? payload.palette.primary : payload.palette.accent;
  const secondaryColor = payload.palette.monochrome ? payload.palette.primary : payload.palette.secondary;
  const strokeCount = payload.complexity === "simple" ? 3 : payload.complexity === "medium" ? 5 : 8;
  const safePrompt = escapeXml(payload.prompt.slice(0, 86));

  const strokes = Array.from({ length: strokeCount })
    .map((_, index) => {
      const seed = baseSeed + index * 149;
      const x1 = (seed % 86) + 7;
      const y1 = ((seed >> 5) % 76) + 10;
      const x2 = ((seed >> 3) % 82) + 10;
      const y2 = ((seed >> 2) % 72) + 12;
      const widthStroke = (seed % 5) + 2;
      const color = index % 2 === 0 ? accentColor : secondaryColor;
      const opacity = 0.28 + ((seed % 35) / 100);
      return `<line x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%" stroke="${color}" stroke-width="${widthStroke}" opacity="${opacity.toFixed(2)}" stroke-linecap="round" />`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Mock style transfer output">
  <defs>
    <linearGradient id="overlay" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${payload.palette.primary}" stop-opacity="0.30" />
      <stop offset="100%" stop-color="${secondaryColor}" stop-opacity="0.36" />
    </linearGradient>
    <radialGradient id="vignette" cx="50%" cy="42%" r="70%">
      <stop offset="0%" stop-color="rgba(0,0,0,0)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0.48)" />
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="#080808" />
  <image href="${escapeXml(sourceImageDataUrl)}" x="${inset}" y="${inset}" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="xMidYMid slice" />
  <rect x="${inset}" y="${inset}" width="${imageWidth}" height="${imageHeight}" fill="url(#overlay)" />
  <rect x="${inset}" y="${inset}" width="${imageWidth}" height="${imageHeight}" fill="url(#vignette)" />
  ${strokes}
  <rect x="${inset}" y="${inset}" rx="22" ry="22" width="${imageWidth}" height="${imageHeight}" fill="none" stroke="rgba(255,255,255,0.28)" />
  <g fill="white">
    <text x="${inset + 22}" y="${height - 86}" font-size="18" font-family="Arial, Helvetica, sans-serif" opacity="0.9">${escapeXml(payload.style)} / ${escapeXml(
      payload.illustrationType,
    )} / style transfer</text>
    <text x="${inset + 22}" y="${height - 52}" font-size="24" font-weight="600" font-family="Arial, Helvetica, sans-serif">${safePrompt || "IllustrateLab styled variant"}</text>
  </g>
</svg>`;
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
