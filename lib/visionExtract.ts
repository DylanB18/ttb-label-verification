import Anthropic from "@anthropic-ai/sdk";
import type { LabelFields, WarningFormatCheck } from "./types";

const VISION_MODEL = "claude-haiku-4-5-20251001";

type SupportedMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export interface VisionAssessment {
  fields: LabelFields;
  warningFormat: WarningFormatCheck;
}

// Which backend runs vision calls. "local" points at a self-hosted,
// Ollama-style vision model reachable from inside the deployment's own
// network — useful when an outbound firewall blocks calls to api.anthropic.com.
const VISION_BACKEND = process.env.VISION_BACKEND === "local" ? "local" : "anthropic";

const LOCAL_VISION_URL = process.env.LOCAL_VISION_URL ?? "http://localhost:11434/api/chat";
const LOCAL_VISION_MODEL = process.env.LOCAL_VISION_MODEL ?? "llava";

// Shared across backends so behavior doesn't depend on which model runs it:
// brand/class must be transcribed verbatim (the compare step, not the model,
// decides whether a shortened form counts as a match); the warning text must
// be preserved exactly since it's checked word-for-word; and the formatting
// assessment (bold lead-in, non-bold body, visual separation) is a judgment
// about the image itself, not something OCR text can ever tell you — this is
// why every request goes through vision now, not just low-confidence OCR.
const ASSESSMENT_INSTRUCTIONS =
  "Extract the label fields from this alcohol beverage label photo, and separately assess the Government Warning statement's formatting. Transcribe the brand name and class/type exactly as printed on the label — do not expand abbreviations, complete a shortened name, or substitute a fuller name you may know from outside knowledge; the application may legitimately use a shortened or abbreviated form, and that comparison is handled downstream. Preserve exact capitalization and punctuation as printed for the extracted fields, especially the government warning text, since that field is checked word-for-word against the required federal wording. Separately, for formatting: TTB regulations require the \"GOVERNMENT WARNING:\" lead-in to be printed in bold type, the rest of the statement to NOT be bold, and the whole statement to be visually set off from other label text (its own block, not buried in or run together with unrelated text). Assess this based only on what's visually apparent in the image.";

const ASSESSMENT_TOOL = {
  name: "assess_label",
  description: "Extract structured fields from a photograph of an alcohol beverage label, and assess the visual formatting of its Government Warning statement.",
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
      boldLeadIn: {
        type: ["boolean", "null"],
        description: "True if the 'GOVERNMENT WARNING:' lead-in visually appears bold/heavier weight than the rest of the statement. Null if the warning isn't visible at all.",
      },
      restNotBold: {
        type: ["boolean", "null"],
        description: "True if the remainder of the warning statement (after the lead-in) is NOT bold. Null if the warning isn't visible at all.",
      },
      visuallySeparated: {
        type: ["boolean", "null"],
        description: "True if the warning statement is visually set off from other label text, rather than buried inside or run together with unrelated text. Null if the warning isn't visible at all.",
      },
      formattingNotes: { type: ["string", "null"], description: "Brief note on anything relevant to the formatting assessment, or null." },
    },
    required: [
      "brandName",
      "classType",
      "alcoholContent",
      "netContents",
      "governmentWarning",
      "boldLeadIn",
      "restNotBold",
      "visuallySeparated",
      "formattingNotes",
    ],
  },
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Runs a single vision call that both extracts label fields and assesses
 * the government warning's formatting. Called on every request — unlike
 * field extraction (which OCR handles unaided in the common case), the
 * formatting judgment has no OCR equivalent, so vision always runs for it.
 * Dispatches to Claude Haiku (default) or a self-hosted local vision model
 * (VISION_BACKEND=local) so the pipeline can run entirely inside a network
 * that blocks calls to the Anthropic API.
 */
export async function runVisionAssessment(imageBuffer: Buffer, mediaType: SupportedMediaType): Promise<VisionAssessment> {
  if (VISION_BACKEND === "local") {
    return runVisionAssessmentLocal(imageBuffer);
  }
  return runVisionAssessmentAnthropic(imageBuffer, mediaType);
}

async function runVisionAssessmentAnthropic(imageBuffer: Buffer, mediaType: SupportedMediaType): Promise<VisionAssessment> {
  const base64 = imageBuffer.toString("base64");

  const message = await getClient().messages.create({
    model: VISION_MODEL,
    max_tokens: 1024,
    tools: [ASSESSMENT_TOOL],
    tool_choice: { type: "tool", name: "assess_label" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: ASSESSMENT_INSTRUCTIONS },
        ],
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Vision assessment did not return structured output.");
  }

  return coerceAssessment(toolUse.input);
}

/**
 * Calls a self-hosted Ollama-compatible vision model (e.g. llava, bakllava,
 * minicpm-v) over its native /api/chat endpoint. No forced tool-calling
 * support here, so we ask for JSON directly and validate the shape.
 */
async function runVisionAssessmentLocal(imageBuffer: Buffer): Promise<VisionAssessment> {
  const base64 = imageBuffer.toString("base64");

  const prompt = `${ASSESSMENT_INSTRUCTIONS} Respond with ONLY a JSON object with exactly these keys: brandName, classType, alcoholContent, netContents, governmentWarning (each a string, or JSON null if not visible), boldLeadIn, restNotBold, visuallySeparated (each JSON true/false, or null if the warning isn't visible at all), and formattingNotes (a short string or null). Do not include any text outside the JSON object.`;

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

  return coerceAssessment(parsed);
}

function coerceAssessment(value: unknown): VisionAssessment {
  const obj = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const asString = (v: unknown): string | null => (typeof v === "string" && v.trim().length > 0 ? v : null);
  const asBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

  return {
    fields: {
      brandName: asString(obj.brandName),
      classType: asString(obj.classType),
      alcoholContent: asString(obj.alcoholContent),
      netContents: asString(obj.netContents),
      governmentWarning: asString(obj.governmentWarning),
    },
    warningFormat: {
      boldLeadIn: asBool(obj.boldLeadIn),
      restNotBold: asBool(obj.restNotBold),
      visuallySeparated: asBool(obj.visuallySeparated),
      notes: asString(obj.formattingNotes),
    },
  };
}

export function mediaTypeFromMime(mime: string): SupportedMediaType {
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/gif" || mime === "image/webp") {
    return mime;
  }
  throw new Error(`Unsupported image type: ${mime}`);
}
