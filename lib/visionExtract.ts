import Anthropic from "@anthropic-ai/sdk";
import type { LabelFields } from "./types";

const VISION_MODEL = "claude-haiku-4-5-20251001";

type SupportedMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

// Which backend runs the vision fallback. "local" points at a self-hosted,
// OpenAI/Ollama-style vision model reachable from inside the deployment's own
// network — useful when an outbound firewall blocks calls to api.anthropic.com.
const VISION_BACKEND = process.env.VISION_BACKEND === "local" ? "local" : "anthropic";

const LOCAL_VISION_URL = process.env.LOCAL_VISION_URL ?? "http://localhost:11434/api/chat";
const LOCAL_VISION_MODEL = process.env.LOCAL_VISION_MODEL ?? "llava";

// Shared across backends so the fallback behaves the same regardless of which
// model runs it: brand/class must be transcribed verbatim (the compare step,
// not the model, decides whether a shortened form counts as a match), while
// the government warning must be preserved exactly since it's checked
// word-for-word against fixed federal text.
const EXTRACTION_INSTRUCTIONS =
  "Extract the label fields from this alcohol beverage label photo. Transcribe the brand name and class/type exactly as printed on the label — do not expand abbreviations, complete a shortened name, or substitute a fuller name you may know from outside knowledge; the application may legitimately use a shortened or abbreviated form, and that comparison is handled downstream. Preserve exact capitalization and punctuation as printed, especially for the government warning statement, since that field is checked word-for-word against the required federal text.";

const EXTRACT_TOOL = {
  name: "extract_label_fields",
  description: "Extract structured fields from a photograph of an alcohol beverage label.",
  input_schema: {
    type: "object" as const,
    properties: {
      brandName: { type: ["string", "null"], description: "The brand name as printed on the label, or null if not visible." },
      classType: { type: ["string", "null"], description: "The class/type designation (e.g. 'Kentucky Straight Bourbon Whiskey'), or null." },
      alcoholContent: { type: ["string", "null"], description: "The alcohol content text as printed (e.g. '45% Alc./Vol. (90 Proof)'), or null." },
      netContents: { type: ["string", "null"], description: "The net contents text as printed (e.g. '750 mL'), or null." },
      governmentWarning: {
        type: ["string", "null"],
        description: "The full government warning statement, transcribed exactly as printed with original capitalization and punctuation preserved, or null if not present.",
      },
    },
    required: ["brandName", "classType", "alcoholContent", "netContents", "governmentWarning"],
  },
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Fallback extractor used when OCR confidence is low or fields are missing.
 * Dispatches to Claude Haiku (default) or a self-hosted local vision model
 * (VISION_BACKEND=local), so the pipeline can run entirely inside a network
 * that blocks calls to the Anthropic API.
 */
export async function extractFieldsWithVision(imageBuffer: Buffer, mediaType: SupportedMediaType): Promise<LabelFields> {
  if (VISION_BACKEND === "local") {
    return extractFieldsWithLocalVision(imageBuffer);
  }
  return extractFieldsWithAnthropic(imageBuffer, mediaType);
}

async function extractFieldsWithAnthropic(imageBuffer: Buffer, mediaType: SupportedMediaType): Promise<LabelFields> {
  const base64 = imageBuffer.toString("base64");

  const message = await getClient().messages.create({
    model: VISION_MODEL,
    max_tokens: 1024,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "extract_label_fields" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: EXTRACTION_INSTRUCTIONS },
        ],
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Vision extraction did not return structured output.");
  }

  return toolUse.input as LabelFields;
}

/**
 * Calls a self-hosted Ollama-compatible vision model (e.g. llava, bakllava,
 * minicpm-v) over its native /api/chat endpoint. No forced tool-calling
 * support here, so we ask for JSON directly and validate the shape.
 */
async function extractFieldsWithLocalVision(imageBuffer: Buffer): Promise<LabelFields> {
  const base64 = imageBuffer.toString("base64");

  const prompt = `${EXTRACTION_INSTRUCTIONS} Respond with ONLY a JSON object with exactly these keys: brandName, classType, alcoholContent, netContents, governmentWarning. Use JSON null (not the string "null") for any field that isn't visible on the label. Do not include any text outside the JSON object.`;

  const response = await fetch(LOCAL_VISION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LOCAL_VISION_MODEL,
      stream: false,
      format: "json",
      messages: [{ role: "user", content: prompt, images: [base64] }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Local vision backend at ${LOCAL_VISION_URL} returned ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as { message?: { content?: string } };
  const raw = data.message?.content;
  if (typeof raw !== "string") {
    throw new Error("Local vision backend did not return message content.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Local vision backend did not return valid JSON.");
  }

  return coerceLabelFields(parsed);
}

function coerceLabelFields(value: unknown): LabelFields {
  const obj = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const asField = (v: unknown): string | null => (typeof v === "string" && v.trim().length > 0 ? v : null);
  return {
    brandName: asField(obj.brandName),
    classType: asField(obj.classType),
    alcoholContent: asField(obj.alcoholContent),
    netContents: asField(obj.netContents),
    governmentWarning: asField(obj.governmentWarning),
  };
}

export function mediaTypeFromMime(mime: string): SupportedMediaType {
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/gif" || mime === "image/webp") {
    return mime;
  }
  throw new Error(`Unsupported image type: ${mime}`);
}
