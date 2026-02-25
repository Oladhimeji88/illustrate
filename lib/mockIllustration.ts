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

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
