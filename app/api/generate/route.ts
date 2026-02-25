import { NextRequest, NextResponse } from "next/server";
import { createMockSvg, svgToDataUrl } from "@/lib/mockIllustration";
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

const CLOUDFLARE_MODEL = process.env.CLOUDFLARE_MODEL ?? "@cf/stabilityai/stable-diffusion-xl-base-1.0";
const HF_MODEL = process.env.HF_MODEL ?? "stabilityai/stable-diffusion-xl-base-1.0";
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

function isInList<T extends readonly string[]>(value: string, list: T): value is T[number] {
  return (list as readonly string[]).includes(value);
}

function fail(error: string, status = 400) {
  const body: GenerateFailure = { ok: false, error };
  return NextResponse.json<GenerateResponse>(body, { status });
}

function parsePayload(input: unknown): GenerateRequestBody | null {
  if (!input || typeof input !== "object") return null;

  const candidate = input as Partial<GenerateRequestBody>;
  if (typeof candidate.prompt !== "string" || !candidate.prompt.trim()) return null;
  if (!candidate.illustrationType || !isInList(candidate.illustrationType, ILLUSTRATION_TYPES)) return null;
  if (!candidate.style || !isInList(candidate.style, STYLE_OPTIONS)) return null;
  if (!candidate.complexity || !isInList(candidate.complexity, COMPLEXITY_OPTIONS)) return null;
  if (!candidate.output || !isInList(candidate.output, OUTPUT_OPTIONS)) return null;
  if (!candidate.palette) return null;

  const { palette } = candidate;
  if (!HEX_COLOR.test(palette.primary) || !HEX_COLOR.test(palette.secondary) || !HEX_COLOR.test(palette.accent)) return null;

  return {
    prompt: candidate.prompt.trim().slice(0, 240),
    illustrationType: candidate.illustrationType,
    style: candidate.style,
    complexity: candidate.complexity,
    output: candidate.output,
    forceMock: Boolean(candidate.forceMock),
    palette: {
      primary: palette.primary,
      secondary: palette.secondary,
      accent: palette.accent,
      monochrome: Boolean(palette.monochrome),
    },
  };
}

async function fetchBinaryAsDataUrl(response: Response): Promise<string | null> {
  if (!response.ok) return null;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as Record<string, unknown>;
    const result = payload.result as Record<string, unknown> | undefined;
    const base64 = typeof result?.image === "string" ? result.image : typeof result?.b64_json === "string" ? result.b64_json : null;
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

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_MODEL}`, {
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

async function tryHfImage(prompt: string): Promise<string | null> {
  const token = process.env.HF_TOKEN;
  if (!token) return null;

  const response = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
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

function makeMockResponse(payload: GenerateRequestBody): GenerateSuccess {
  const svg = createMockSvg(payload);
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
    return fail("Invalid request body. Check prompt, options, and hex colors.");
  }

  try {
    if (!parsed.forceMock && parsed.output === "png") {
      const cloudflareResult = await tryCloudflareImage(parsed.prompt);
      if (cloudflareResult) {
        const response: GenerateSuccess = {
          ok: true,
          mode: "cloudflare",
          pngDataUrl: cloudflareResult,
        };
        return NextResponse.json<GenerateResponse>(response);
      }

      const hfResult = await tryHfImage(parsed.prompt);
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
