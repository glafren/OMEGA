import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { IkeaProduct } from "@/types";

const hasCyrillic = (value: string) => /[А-Яа-яЁё]/u.test(value);

const benefitSchema = z.object({
  title: z.string().trim().min(2).max(90).refine(hasCyrillic, "Başlık Rusça olmalı."),
  description: z.string().trim().min(160).max(700).refine(hasCyrillic, "Açıklama Rusça olmalı."),
});

const specificationSchema = z.object({
  label: z.string().trim().min(2).max(80).refine(hasCyrillic, "Özellik etiketi Rusça olmalı."),
  value: z.string().trim().min(1).max(300),
});

export const richContentCopySchema = z.object({
  headline: z.string().trim().min(2).max(120).refine(hasCyrillic, "Ana başlık Rusça olmalı."),
  benefits: z.array(benefitSchema).length(6),
  specifications: z.array(specificationSchema).min(1).max(14),
});

export type RichContentCopy = z.infer<typeof richContentCopySchema>;

const outputSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    benefits: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, description: { type: "string" } },
        required: ["title", "description"],
        additionalProperties: false,
      },
    },
    specifications: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, value: { type: "string" } },
        required: ["label", "value"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "benefits", "specifications"],
  additionalProperties: false,
} as const;

type ResponsesBody = {
  status?: string;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
  error?: { code?: string; message?: string };
};

function readOutputText(body: ResponsesBody) {
  if (body.output_text) return body.output_text;
  return body.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("") || "";
}

export async function generateIkeaRichContentCopy(product: IkeaProduct) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new AppError("OpenAI API anahtarı yapılandırılmamış.", "OPENAI_KEY_MISSING");
  if (!product.description?.trim()) throw new AppError("IKEA ürün açıklaması bulunamadığı için Rich Content hazırlanamadı.", "IKEA_DESCRIPTION_MISSING");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-5-nano",
        reasoning: { effort: "minimal" },
        store: false,
        instructions: [
          "КРИТИЧЕСКОЕ ТРЕБОВАНИЕ: все значения headline, title, description, label и value пиши исключительно на русском языке кириллицей. Исходный текст на турецком нужно перевести; никогда не возвращай турецкий текст.",
          "Ты создаёшь лаконичный Rich Content для карточки товара IKEA на Ozon на русском языке.",
          "Используй только факты из переданного источника; не выдумывай характеристики, гарантии или свойства.",
          "Не упоминай цену, наличие, доставку или акции.",
          "Подготовь ровно 6 содержательных и неповторяющихся преимуществ, выбирая разные аспекты: назначение, комплектация, материал, конструкция, размеры, удобство, уход или ограничения — только если они есть в источнике.",
          "Каждое описание должно содержать 2–4 полноценных предложения и примерно 220–450 знаков: сначала конкретный факт о товаре, затем объяснение, как и в какой бытовой ситуации он полезен покупателю.",
          "Пиши уверенно и естественно; не используй фразы вроде «в описании указано» или «товар описан как». Не делай текст телеграфным, не повторяй одну выгоду разными словами и не заполняй его общими рекламными фразами.",
          "Сохраняй важные размеры, материалы, комплектацию, ограничения по уходу и безопасности. Ограничения формулируй ясно и нейтрально, не превращая их в преимущество.",
          "Также сформируй список технических характеристик на русском языке только по явно указанным данным. Не включай туда бренд, серию и артикул — приложение добавит их само.",
        ].join(" "),
        input: JSON.stringify({
          name: product.fullName || product.modelName,
          article: product.productCode,
          description: product.description,
          details: product.details?.slice(0, 10).map((detail) => ({ title: detail.title, content: detail.content.slice(0, 2_500) })),
          outputLanguage: "Russian (ru-RU), Cyrillic only",
        }),
        text: { format: { type: "json_schema", name: "ikea_rich_content_copy", strict: true, schema: outputSchema } },
        max_output_tokens: 2_500,
      }),
    });
    const body = await response.json() as ResponsesBody;
    if (!response.ok) throw new Error(`${response.status} ${body.error?.code || ""} ${body.error?.message || ""}`.trim());
    if (body.status && body.status !== "completed") throw new Error(`OpenAI yanıtı tamamlanmadı: ${body.status}`);
    const parsed = richContentCopySchema.safeParse(JSON.parse(readOutputText(body)));
    if (!parsed.success) throw new Error(parsed.error.message);
    return {
      copy: parsed.data,
      model: body.model || process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-5-nano",
      usage: {
        inputTokens: body.usage?.input_tokens || 0,
        outputTokens: body.usage?.output_tokens || 0,
        totalTokens: body.usage?.total_tokens || 0,
      },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Rusça Rich Content metni OpenAI ile oluşturulamadı.", "OPENAI_GENERATION_FAILED", { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}
