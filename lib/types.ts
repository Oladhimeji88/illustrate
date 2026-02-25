export const ILLUSTRATION_TYPES = ["icons", "flat vector scene", "outline", "isometric", "sticker", "minimal line art"] as const;

export const STYLE_OPTIONS = ["clean", "playful", "corporate", "sketchy", "bold"] as const;

export const COMPLEXITY_OPTIONS = ["simple", "medium", "detailed"] as const;

export const OUTPUT_OPTIONS = ["svg", "png"] as const;

export type IllustrationType = (typeof ILLUSTRATION_TYPES)[number];
export type StyleOption = (typeof STYLE_OPTIONS)[number];
export type ComplexityOption = (typeof COMPLEXITY_OPTIONS)[number];
export type OutputOption = (typeof OUTPUT_OPTIONS)[number];

export type Palette = {
  primary: string;
  secondary: string;
  accent: string;
  monochrome: boolean;
};

export type GenerateRequestBody = {
  prompt: string;
  illustrationType: IllustrationType;
  style: StyleOption;
  complexity: ComplexityOption;
  palette: Palette;
  output: OutputOption;
  forceMock?: boolean;
};

export type GenerateSuccess = {
  ok: true;
  mode: "cloudflare" | "hf" | "mock";
  svg?: string;
  pngDataUrl?: string;
};

export type GenerateFailure = {
  ok: false;
  error: string;
};

export type GenerateResponse = GenerateSuccess | GenerateFailure;

export type HistoryItem = {
  id: string;
  timestamp: number;
  prompt: string;
  illustrationType: IllustrationType;
  style: StyleOption;
  complexity: ComplexityOption;
  palette: Palette;
  mode: "cloudflare" | "hf" | "mock";
  output: OutputOption;
  svg?: string;
  pngDataUrl?: string;
};

