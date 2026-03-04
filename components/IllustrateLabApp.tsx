"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import {
  COMPLEXITY_OPTIONS,
  ILLUSTRATION_TYPES,
  OUTPUT_OPTIONS,
  STYLE_OPTIONS,
  type GenerateRequestBody,
  type GenerateResponse,
  type GenerateSuccess,
  type HistoryItem,
  type OutputOption,
} from "@/lib/types";

type ProviderStatus = {
  cloudflare: boolean;
  huggingFace: boolean;
};

type IllustrateLabAppProps = {
  providerStatus: ProviderStatus;
};

const HISTORY_LIMIT = 8;
const MAX_SOURCE_IMAGE_BYTES = 4 * 1024 * 1024;

export default function IllustrateLabApp({ providerStatus }: IllustrateLabAppProps) {
  const [prompt, setPrompt] = useState("A cheerful robot watering houseplants");
  const [sourceImageDataUrl, setSourceImageDataUrl] = useState<string | null>(null);
  const [sourceImageName, setSourceImageName] = useState<string | null>(null);
  const [illustrationType, setIllustrationType] = useState<(typeof ILLUSTRATION_TYPES)[number]>(ILLUSTRATION_TYPES[1]);
  const [style, setStyle] = useState<(typeof STYLE_OPTIONS)[number]>(STYLE_OPTIONS[0]);
  const [complexity, setComplexity] = useState<(typeof COMPLEXITY_OPTIONS)[number]>(COMPLEXITY_OPTIONS[1]);
  const [output, setOutput] = useState<OutputOption>("svg");
  const [primary, setPrimary] = useState("#57a6ff");
  const [secondary, setSecondary] = useState("#22d3a6");
  const [accent, setAccent] = useState("#ffd166");
  const [monochrome, setMonochrome] = useState(false);
  const [forceMock, setForceMock] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateSuccess | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const providerText = useMemo(() => {
    const providers: string[] = [];
    if (providerStatus.cloudflare) providers.push("Cloudflare");
    if (providerStatus.huggingFace) providers.push("Hugging Face");
    return providers.length ? providers.join(" + ") : "Mock only";
  }, [providerStatus]);

  const canUseProviders = providerStatus.cloudflare || providerStatus.huggingFace;
  const hasResult = Boolean(result?.pngDataUrl || result?.svg);

  const currentPayload = (): GenerateRequestBody => ({
    prompt: prompt.trim() || `Restyle this image as ${style} ${illustrationType}`,
    illustrationType,
    style,
    complexity,
    palette: {
      primary,
      secondary,
      accent,
      monochrome,
    },
    output,
    sourceImageDataUrl: sourceImageDataUrl ?? undefined,
    forceMock,
  });

  const onSourceImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Upload a valid image file.");
      return;
    }

    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      setError("Image is too large. Maximum size is 4MB.");
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setSourceImageDataUrl(dataUrl);
      setSourceImageName(file.name);
      setOutput("png");
      setError(null);
    } catch {
      setError("Failed to read the uploaded image.");
    }
  };

  const clearSourceImage = () => {
    setSourceImageDataUrl(null);
    setSourceImageName(null);
  };

  const onGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim() && !sourceImageDataUrl) {
      setError("Prompt is required unless you upload a source image.");
      return;
    }

    setLoading(true);
    setError(null);
    const payload = currentPayload();

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as GenerateResponse;
      if (!response.ok || !data.ok) {
        const message = data.ok ? "Failed to generate illustration." : data.error;
        setError(message);
        return;
      }

      setResult(data);
      const historyEntry: HistoryItem = {
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp: Date.now(),
        prompt: payload.prompt,
        illustrationType: payload.illustrationType,
        style: payload.style,
        complexity: payload.complexity,
        palette: payload.palette,
        mode: data.mode,
        output: payload.output,
        sourceImageDataUrl: payload.sourceImageDataUrl,
        svg: data.svg,
        pngDataUrl: data.pngDataUrl,
      };
      setHistory((prev) => [historyEntry, ...prev].slice(0, HISTORY_LIMIT));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unknown request failure";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadFromHistory = (entry: HistoryItem) => {
    setPrompt(entry.prompt);
    setIllustrationType(entry.illustrationType);
    setStyle(entry.style);
    setComplexity(entry.complexity);
    setOutput(entry.output);
    setPrimary(entry.palette.primary);
    setSecondary(entry.palette.secondary);
    setAccent(entry.palette.accent);
    setMonochrome(entry.palette.monochrome);
    setSourceImageDataUrl(entry.sourceImageDataUrl ?? null);
    setSourceImageName(entry.sourceImageDataUrl ? "history-image" : null);
    setResult({
      ok: true,
      mode: entry.mode,
      svg: entry.svg,
      pngDataUrl: entry.pngDataUrl,
    });
    setError(null);
  };

  const onDownloadPng = async () => {
    if (!result) return;

    try {
      setError(null);
      const fileName = createDownloadName("png");

      if (result.pngDataUrl) {
        const pngDataUrl = result.pngDataUrl.startsWith("data:image/png")
          ? result.pngDataUrl
          : await imageToPngDataUrl(result.pngDataUrl);
        triggerDownload(pngDataUrl, fileName);
        return;
      }

      if (result.svg) {
        const pngDataUrl = await svgMarkupToPngDataUrl(result.svg);
        triggerDownload(pngDataUrl, fileName);
        return;
      }

      setError("No illustration available to download.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to download PNG.";
      setError(message);
    }
  };

  const onDownloadSvg = async () => {
    if (!result) return;

    try {
      setError(null);
      const fileName = createDownloadName("svg");

      if (result.svg) {
        downloadTextAsFile(result.svg, "image/svg+xml;charset=utf-8", fileName);
        return;
      }

      if (result.pngDataUrl) {
        const wrappedSvg = await rasterDataUrlToSvgMarkup(result.pngDataUrl);
        downloadTextAsFile(wrappedSvg, "image/svg+xml;charset=utf-8", fileName);
        return;
      }

      setError("No illustration available to download.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to download SVG.";
      setError(message);
    }
  };

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <section className="rounded-2xl border border-border bg-panel p-5 shadow-panel sm:p-6">
          <h1 className="text-2xl font-semibold tracking-tight">IllustrateLab</h1>
          <p className="mt-2 text-sm text-textMuted">
            Generate illustration concepts from text or upload an image to create styled variants from the same art.
          </p>
          <div className="mt-4 rounded-xl border border-border bg-panelMuted px-3 py-2 text-xs text-textMuted">
            Providers: <span className="text-text">{providerText}</span>
          </div>
          <form className="mt-5 space-y-4" onSubmit={onGenerate}>
            <label className="block text-sm">
              <span className="mb-1 block text-textMuted">Prompt</span>
              <textarea
                className="h-24 w-full resize-y rounded-lg border border-border bg-black/20 px-3 py-2"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Scene prompt or style instruction for uploaded image"
              />
            </label>

            <div className="rounded-lg border border-border bg-black/20 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-textMuted">Source image (optional)</span>
                {sourceImageDataUrl ? (
                  <button type="button" onClick={clearSourceImage} className="text-xs text-textMuted transition hover:text-text">
                    Remove
                  </button>
                ) : null}
              </div>
              <input type="file" accept="image/*" onChange={onSourceImageChange} className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-black" />
              <p className="mt-2 text-xs text-textMuted">
                Upload once, then generate style variations from the same composition (similar to Whisk workflow).
              </p>
              {sourceImageDataUrl ? (
                <div className="mt-3 overflow-hidden rounded-lg border border-border">
                  <img src={sourceImageDataUrl} alt="Source artwork" className="h-40 w-full object-cover" />
                  <p className="truncate border-t border-border bg-panelMuted px-2 py-1 text-xs text-textMuted">{sourceImageName ?? "source-image"}</p>
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Type"
                value={illustrationType}
                options={ILLUSTRATION_TYPES}
                onChange={setIllustrationType}
              />
              <SelectField label="Style" value={style} options={STYLE_OPTIONS} onChange={setStyle} />
              <SelectField
                label="Complexity"
                value={complexity}
                options={COMPLEXITY_OPTIONS}
                onChange={setComplexity}
              />
              <SelectField label="Output" value={output} options={OUTPUT_OPTIONS} onChange={setOutput} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <ColorField label="Primary" value={primary} onChange={setPrimary} />
              <ColorField label="Secondary" value={secondary} onChange={setSecondary} />
              <ColorField label="Accent" value={accent} onChange={setAccent} />
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={monochrome} onChange={(event) => setMonochrome(event.target.checked)} />
                Monochrome mode
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={forceMock}
                  onChange={(event) => setForceMock(event.target.checked)}
                  disabled={!canUseProviders}
                />
                Force mock output
              </label>
            </div>

            {error ? <p className="rounded-lg border border-red-500/40 bg-red-900/20 px-3 py-2 text-sm text-red-200">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-lg bg-white px-4 py-2 font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Generating..." : "Generate"}
            </button>
          </form>
        </section>

        <section className="space-y-6">
          {sourceImageDataUrl ? (
            <div className="rounded-2xl border border-border bg-panel p-4 shadow-panel sm:p-5">
              <h2 className="text-lg font-semibold">Source</h2>
              <div className="mt-3 overflow-hidden rounded-xl border border-border bg-black/25 p-3">
                <img src={sourceImageDataUrl} alt="Source upload" className="mx-auto max-h-[340px] w-full rounded-lg object-contain" />
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-panel p-4 shadow-panel sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Preview</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onDownloadPng}
                  disabled={!hasResult || loading}
                  className="rounded-md border border-border px-2.5 py-1 text-xs text-textMuted transition hover:border-white/35 hover:text-text disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Download PNG
                </button>
                <button
                  type="button"
                  onClick={onDownloadSvg}
                  disabled={!hasResult || loading}
                  className="rounded-md border border-border px-2.5 py-1 text-xs text-textMuted transition hover:border-white/35 hover:text-text disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Download SVG
                </button>
                <span className="text-xs uppercase tracking-wide text-textMuted">{result?.mode ?? "idle"}</span>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-border bg-black/25 p-3">
              {result?.pngDataUrl ? (
                <img src={result.pngDataUrl} alt="Generated illustration" className="mx-auto max-h-[480px] w-full rounded-lg object-contain" />
              ) : result?.svg ? (
                <div className="mx-auto h-full max-h-[480px] min-h-[320px] w-full overflow-hidden rounded-lg" dangerouslySetInnerHTML={{ __html: result.svg }} />
              ) : (
                <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-textMuted">
                  Submit a prompt to generate a preview.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-panel p-4 shadow-panel sm:p-5">
            <h2 className="text-lg font-semibold">Recent Runs</h2>
            {history.length ? (
              <ul className="mt-3 space-y-2">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => loadFromHistory(entry)}
                      className="w-full rounded-lg border border-border bg-panelMuted px-3 py-2 text-left transition hover:border-white/30"
                    >
                      <p className="line-clamp-1 text-sm">{entry.prompt}</p>
                      <p className="mt-1 text-xs text-textMuted">
                        {entry.style} | {entry.illustrationType} | {entry.sourceImageDataUrl ? "img2img" : "text2img"} |{" "}
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-textMuted">No history yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

type SelectFieldProps<T extends string> = {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
};

function SelectField<T extends string>({ label, value, options, onChange }: SelectFieldProps<T>) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-textMuted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="w-full rounded-lg border border-border bg-black/20 px-3 py-2"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

type ColorFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-textMuted">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-black/20 px-2 py-1">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent px-1 py-1 text-sm outline-none"
        />
      </div>
    </label>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Invalid file payload"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function createDownloadName(extension: "png" | "svg"): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `illustratelab-${stamp}.${extension}`;
}

function triggerDownload(url: string, filename: string, revokeAfter = false) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  if (revokeAfter) {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function downloadTextAsFile(content: string, mimeType: string, filename: string) {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  triggerDownload(objectUrl, filename, true);
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load illustration image."));
    image.src = src;
  });
}

async function imageToPngDataUrl(imageSource: string): Promise<string> {
  const image = await loadImageElement(imageSource);
  const width = image.naturalWidth || image.width || 1024;
  const height = image.naturalHeight || image.height || 1024;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable.");

  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

async function svgMarkupToPngDataUrl(svgMarkup: string): Promise<string> {
  const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await imageToPngDataUrl(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function rasterDataUrlToSvgMarkup(imageDataUrl: string): Promise<string> {
  const image = await loadImageElement(imageDataUrl);
  const width = image.naturalWidth || image.width || 1024;
  const height = image.naturalHeight || image.height || 1024;
  const safeHref = escapeXmlAttribute(imageDataUrl);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <image href="${safeHref}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" />
</svg>`;
}
