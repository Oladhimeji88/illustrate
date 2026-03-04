import { NextRequest, NextResponse } from "next/server";
import { createMockSvg, createMockSvgFromSource, svgToDataUrl } from "@/lib/mockIllustration";
import {
  COMPLEXITY_OPTIONS,
  ILLUSTRATION_TYPES,
  OUTPUT_OPTIONS,
  STYLE_OPTIONS,
  type GenerateFailure,
  type GenerateRequestBody,
  type GenerateResponse,
  type GenerateSuccess,
} from "@/lib/types";

const CLOUDFLARE_TEXT_MODEL = process.env.CLOUDFLARE_MODEL ?? "@cf/stabilityai/stable-diffusion-xl-base-1.0";
const CLOUDFLARE_IMAGE_MODEL = process.env.CLOUDFLARE_IMAGE_MODEL ?? "@cf/runwayml/stable-diffusion-v1-5-img2img";
const HF_TEXT_MODEL = process.env.HF_MODEL ?? "stabilityai/stable-diffusion-xl-base-1.0";
const HF_IMAGE_MODEL = process.env.HF_IMAGE_MODEL ?? "timbrooks/instruct-pix2pix";
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
const IMAGE_DATA_URL = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/;
const MAX_SOURCE_IMAGE_BYTES = 4 * 1024 * 1024;

type ParsedImageDataUrl = {
  base64: string;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseImageDataUrl(dataUrl: string): ParsedImageDataUrl | null {
  const match = dataUrl.match(IMAGE_DATA_URL);
  if (!match) return null;

  const base64 = match[2].replace(/\s+/g, "");
  const estimatedBytes = Math.floor((base64.length * 3) / 4);
  if (!base64 || estimatedBytes > MAX_SOURCE_IMAGE_BYTES) return null;

  return { base64 };
}

function isInList<T extends readonly string[]>(value: string, list: T): value is T[number] {
  return (list as readonly string[]).includes(value);
}

function fail(error: string, status = 400) {
  const body: GenerateFailure = { ok: false, error };
  return NextResponse.json<GenerateResponse>(body, { status });
}

function parsePayload(input: unknown): GenerateRequestBody | null {
  if (!isObjectRecord(input)) return null;

  const prompt = typeof input.prompt === "string" ? input.prompt.trim().slice(0, 240) : "";
  if (!prompt) return null;

  if (typeof input.illustrationType !== "string" || !isInList(input.illustrationType, ILLUSTRATION_TYPES)) return null;
  if (typeof input.style !== "string" || !isInList(input.style, STYLE_OPTIONS)) return null;
  if (typeof input.complexity !== "string" || !isInList(input.complexity, COMPLEXITY_OPTIONS)) return null;
  if (typeof input.output !== "string" || !isInList(input.output, OUTPUT_OPTIONS)) return null;

  const palette = input.palette;
  if (!isObjectRecord(palette)) return null;

  const primary = typeof palette.primary === "string" ? palette.primary : "";
  const secondary = typeof palette.secondary === "string" ? palette.secondary : "";
  const accent = typeof palette.accent === "string" ? palette.accent : "";
  if (!HEX_COLOR.test(primary) || !HEX_COLOR.test(secondary) || !HEX_COLOR.test(accent)) return null;

  let sourceImageDataUrl: string | undefined;
  if (typeof input.sourceImageDataUrl === "string" && input.sourceImageDataUrl.trim()) {
    const normalized = input.sourceImageDataUrl.trim();
    if (!parseImageDataUrl(normalized)) return null;
    sourceImageDataUrl = normalized;
  } else if (input.sourceImageDataUrl !== undefined && input.sourceImageDataUrl !== null) {
    return null;
  }

  return {
    prompt,
    illustrationType: input.illustrationType,
    style: input.style,
    complexity: input.complexity,
    output: input.output,
    sourceImageDataUrl,
    forceMock: Boolean(input.forceMock),
    palette: {
      primary,
      secondary,
      accent,
      monochrome: Boolean(palette.monochrome),
    },
  };
}

function normalizeBase64(candidate: string): string | null {
  const trimmed = candidate.trim();
  if (!trimmed) return null;

  const asDataUrl = parseImageDataUrl(trimmed);
  if (asDataUrl) return asDataUrl.base64;

  const compact = trimmed.replace(/\s+/g, "");
  if (compact.length < 96) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) return null;
  return compact;
}

function findBase64InJson(payload: unknown): string | null {
  if (typeof payload === "string") return normalizeBase64(payload);
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const candidate = findBase64InJson(entry);
      if (candidate) return candidate;
    }
    return null;
  }
  if (!isObjectRecord(payload)) return null;

  const directKeys = ["image", "b64_json", "generated_image", "base64", "output", "data"];
  for (const key of directKeys) {
    const value = payload[key];
    if (typeof value === "string") {
      const candidate = normalizeBase64(value);
      if (candidate) return candidate;
    }
  }

  if ("result" in payload) {
    const nested = findBase64InJson(payload.result);
    if (nested) return nested;
  }

  if ("images" in payload) {
    const nested = findBase64InJson(payload.images);
    if (nested) return nested;
  }

  return null;
}

async function fetchBinaryAsDataUrl(response: Response): Promise<string | null> {
  if (!response.ok) return null;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as unknown;
    const base64 = findBase64InJson(payload);
    return base64 ? `data:image/png;base64,${base64}` : null;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const mime = contentType && contentType !== "application/octet-stream" ? contentType : "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function tryCloudflareImage(prompt: string): Promise<string | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) return null;

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_TEXT_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
    cache: "no-store",
  });

  return fetchBinaryAsDataUrl(response);
}

async function tryCloudflareImageToImage(prompt: string, sourceImageBase64: string): Promise<string | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) return null;

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_IMAGE_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_b64: sourceImageBase64,
      strength: 0.72,
      num_steps: 20,
    }),
    cache: "no-store",
  });

  return fetchBinaryAsDataUrl(response);
}

function buildProviderPrompt(payload: GenerateRequestBody): string {
  const paletteSummary = payload.palette.monochrome
    ? `monochrome ${payload.palette.primary}`
    : `${payload.palette.primary}, ${payload.palette.secondary}, ${payload.palette.accent}`;

  const subjectLine = payload.sourceImageDataUrl
    ? `Use the uploaded image as the base subject and composition. Style instruction: ${payload.prompt}.`
    : `Subject: ${payload.prompt}.`;

  return [
    `Create a ${payload.style} ${payload.illustrationType} illustration.`,
    subjectLine,
    `Complexity: ${payload.complexity}.`,
    `Color palette: ${paletteSummary}.`,
    "Clean composition, no text, high visual contrast.",
  ].join(" ");
}

async function tryHfImage(prompt: string): Promise<string | null> {
  const token = process.env.HF_TOKEN;
  if (!token) return null;

  const response = await fetch(`https://api-inference.huggingface.co/models/${HF_TEXT_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: prompt }),
    cache: "no-store",
  });

  return fetchBinaryAsDataUrl(response);
}

async function tryHfImageToImage(prompt: string, sourceImageBase64: string): Promise<string | null> {
  const token = process.env.HF_TOKEN;
  if (!token) return null;

  const response = await fetch(`https://api-inference.huggingface.co/models/${HF_IMAGE_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: sourceImageBase64,
      parameters: {
        prompt,
        strength: 0.72,
      },
    }),
    cache: "no-store",
  });

  return fetchBinaryAsDataUrl(response);
}

function makeMockResponse(payload: GenerateRequestBody): GenerateSuccess {
  const svg = payload.sourceImageDataUrl ? createMockSvgFromSource(payload, payload.sourceImageDataUrl) : createMockSvg(payload);
  return {
    ok: true,
    mode: "mock",
    svg,
    pngDataUrl: svgToDataUrl(svg),
  };
}

export async function POST(request: NextRequest) {
  let parsed: GenerateRequestBody | null = null;

  try {
    const body = (await request.json()) as unknown;
    parsed = parsePayload(body);
  } catch {
    return fail("Invalid JSON body.");
  }

  if (!parsed) {
    return fail("Invalid request body. Check prompt, options, hex colors, and image upload format.");
  }

  try {
    const providerPrompt = buildProviderPrompt(parsed);
    const sourceImage = parsed.sourceImageDataUrl ? parseImageDataUrl(parsed.sourceImageDataUrl) : null;

    if (!parsed.forceMock && parsed.output === "png") {
      if (sourceImage) {
        const cloudflareStyleResult = await tryCloudflareImageToImage(providerPrompt, sourceImage.base64);
        if (cloudflareStyleResult) {
          const response: GenerateSuccess = {
            ok: true,
            mode: "cloudflare",
            pngDataUrl: cloudflareStyleResult,
          };
          return NextResponse.json<GenerateResponse>(response);
        }

        const hfStyleResult = await tryHfImageToImage(providerPrompt, sourceImage.base64);
        if (hfStyleResult) {
          const response: GenerateSuccess = {
            ok: true,
            mode: "hf",
            pngDataUrl: hfStyleResult,
          };
          return NextResponse.json<GenerateResponse>(response);
        }

        return NextResponse.json<GenerateResponse>(makeMockResponse(parsed));
      }

      const cloudflareResult = await tryCloudflareImage(providerPrompt);
      if (cloudflareResult) {
        const response: GenerateSuccess = {
          ok: true,
          mode: "cloudflare",
          pngDataUrl: cloudflareResult,
        };
        return NextResponse.json<GenerateResponse>(response);
      }

      const hfResult = await tryHfImage(providerPrompt);
      if (hfResult) {
        const response: GenerateSuccess = {
          ok: true,
          mode: "hf",
          pngDataUrl: hfResult,
        };
        return NextResponse.json<GenerateResponse>(response);
      }
    }

    return NextResponse.json<GenerateResponse>(makeMockResponse(parsed));
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Unknown server failure";
    return fail(`Generation failed: ${message}`, 500);
  }
}
