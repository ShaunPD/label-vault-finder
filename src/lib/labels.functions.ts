import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ScanInput = z.object({
  imageDataUrl: z.string().min(20).max(15_000_000),
});

const FIELDS_SCHEMA = {
  type: "object",
  properties: {
    brand_name: { type: "string", description: "Brand Name exactly as printed" },
    class_type: { type: "string", description: "Class / Type of beverage (e.g. Bourbon Whiskey, Vodka, Red Wine)" },
    alcohol_content: { type: "string", description: "Alcohol content as printed, e.g. '40% ALC/VOL (80 Proof)'" },
    net_contents: { type: "string", description: "Net contents as printed, e.g. '750 ML'" },
    government_warning: { type: "string", description: "Full text of the Government Warning paragraph if visible, otherwise empty string" },
  },
  required: ["brand_name", "class_type", "alcohol_content", "net_contents", "government_warning"],
  additionalProperties: false,
} as const;

export type ScannedFields = {
  brand_name: string;
  class_type: string;
  alcohol_content: string;
  net_contents: string;
  government_warning: string;
};

export const scanLabel = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ScanInput.parse(input))
  .handler(async ({ data }): Promise<ScannedFields> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You extract information from alcoholic beverage labels. Read the image carefully and return ONLY the requested fields. If a field is not visible, return an empty string for that field. Do not invent values.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract these fields from this label image." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_label_fields",
              description: "Return the extracted label fields",
              parameters: FIELDS_SCHEMA,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_label_fields" } },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Rate limited. Please wait a moment and try again.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace billing.");
      throw new Error(`AI error ${res.status}: ${text.slice(0, 200)}`);
    }

    const payload = await res.json();
    const args =
      payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ??
      payload?.choices?.[0]?.message?.content;

    if (!args) throw new Error("AI returned no result");
    const parsed = typeof args === "string" ? JSON.parse(args) : args;

    return {
      brand_name: String(parsed.brand_name ?? "").trim(),
      class_type: String(parsed.class_type ?? "").trim(),
      alcohol_content: String(parsed.alcohol_content ?? "").trim(),
      net_contents: String(parsed.net_contents ?? "").trim(),
      government_warning: String(parsed.government_warning ?? "").trim(),
    };
  });
