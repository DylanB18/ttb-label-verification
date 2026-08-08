import Anthropic from "@anthropic-ai/sdk";
import type { LabelFields } from "./types";

const VISION_MODEL = "claude-haiku-4-5-20251001";

type SupportedMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

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
 * Uses a cheap, fast vision model with a forced tool call so the response
 * is always well-formed JSON matching LabelFields.
 */
export async function extractFieldsWithVision(imageBuffer: Buffer, mediaType: SupportedMediaType): Promise<LabelFields> {
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
          {
            type: "text",
            text: "Extract the label fields from this alcohol beverage label photo. Preserve exact capitalization and punctuation as printed, especially for the government warning statement, since that field is checked word-for-word.",
          },
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

export function mediaTypeFromMime(mime: string): SupportedMediaType {
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/gif" || mime === "image/webp") {
    return mime;
  }
  throw new Error(`Unsupported image type: ${mime}`);
}
