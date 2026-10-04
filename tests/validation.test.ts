import { describe, expect, it, vi } from "vitest";
import { createJobSchema, isAllowedIkeaUrl, isAllowedPhilipsUrl, normalizeProductCode } from "@/lib/validation";
import { sanitizeFilename } from "@/lib/filename";
import { centeredPlacement, containSize } from "@/lib/image-layout";
import { deduplicateImageUrls } from "@/services/ikea/imageExtractor";
import { extractModelName } from "@/services/ikea/ikeaScraper";
import { fitProductName } from "@/services/images/textRenderer";
import { calculateSlideDuration, TRANSITION_SECONDS } from "@/services/video/videoCreator";
import { canonicalizePhilipsFeatureImage, canonicalizePhilipsImage } from "@/services/philips/philipsScraper";
import { createPhilipsRichContent } from "@/services/philips/richContent";
import { createIkeaRichContent, selectIkeaRichContentTemplate } from "@/services/ikea/richContent";
import type { IkeaProduct } from "@/types";

describe("ürün kodu", () => { it("normalize eder", () => { expect(normalizeProductCode("806 264 18")).toBe("806.264.18"); expect(normalizeProductCode("80626418")).toBe("806.264.18"); }); it("geçersiz kodu reddeder", () => expect(normalizeProductCode("123")).toBeNull()); });
describe("URL güvenliği", () => { it("IKEA alan adlarını kabul eder", () => { expect(isAllowedIkeaUrl("https://www.ikea.com.tr/urun/test-80626418")).toBe(true); expect(isAllowedIkeaUrl("https://ikea.de/de/p/test")).toBe(true); }); it("yanıltıcı ve güvensiz adresleri reddeder", () => { expect(isAllowedIkeaUrl("https://ikea.com.evil.test/x")).toBe(false); expect(isAllowedIkeaUrl("http://ikea.com/x")).toBe(false); }); });
describe("Philips doğrulaması", () => { it("yalnızca resmi Türkiye ürün linkini kabul eder", () => { const url = "https://www.philips.com.tr/c-p/QP2824_10/oneblade-yuez-ve-vuecut"; expect(isAllowedPhilipsUrl(url)).toBe(true); expect(createJobSchema.safeParse({ brand: "philips", input: url }).success).toBe(true); expect(isAllowedPhilipsUrl("https://www.philips.com.tr/support/test")).toBe(false); expect(isAllowedPhilipsUrl("https://philips.com.tr.evil.test/c-p/test")).toBe(false); }); it("görselleri uygun Philips CDN adreslerine dönüştürür", () => { expect(canonicalizePhilipsImage("https://images.philips.com/is/image/philipsconsumer/abc?$png$&wid=410")).toBe("https://images.philips.com/is/image/philipsconsumer/abc?$png$&wid=1200&hei=1200&fit=constrain"); expect(canonicalizePhilipsFeatureImage("https://images.philips.com/is/image/philipsconsumer/card?$png$&wid=400")).toBe("https://images.philips.com/is/image/philipsconsumer/card?$png$&wid=1200"); }); });
describe("Philips Rich Content", () => { it("özellik kartını Ozon şemasında Rusça tileL bloğuna dönüştürür", async () => { const result = await createPhilipsRichContent([{ imageUrl: "https://images.philips.com/is/image/philipsconsumer/card?$png$&wid=1416", title: "Tüm bakım ihtiyaçlarınız için 9 başlık", text: "Erkek bakım setimiz, sakalınızı kısaltmanız ve şekillendirmeniz, saçınızı kısaltmanız ve vücut bakımınızı yapmanız için 9 farklı başlıkla birlikte gelir; böylece kişisel bakım ihtiyaçlarınızın tümünü kolayca karşılar." }]); expect(result.version).toBe(0.3); expect(result.content[0]).toMatchObject({ widgetName: "raShowcase", type: "tileL" }); expect(result.content[0].blocks[0].title.items[0].content).toBe("9 насадок для всех ваших потребностей по уходу"); expect(result.content[0].blocks[0].img.widthMobile).toBe(400); }); });
describe("Philips OpenAI çevirisi", () => { it("tüm özellik kartlarını tek gpt-6-luna isteğinde çevirir", async () => { const previousKey = process.env.OPENAI_API_KEY; const previousModel = process.env.OPENAI_TEXT_MODEL; process.env.OPENAI_API_KEY = "test-key"; delete process.env.OPENAI_TEXT_MODEL; const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => { const request = JSON.parse(String(init?.body)); expect(request.model).toBe("gpt-6-luna"); expect(request.reasoning).toEqual({ effort: "none" }); expect(JSON.parse(request.input)).toHaveLength(2); return new Response(JSON.stringify({ status: "completed", output_text: JSON.stringify({ translations: [{ title: "Первый заголовок", text: "Первое описание товара" }, { title: "Второй заголовок", text: "Второе описание товара" }] }) }), { status: 200 }); }); try { const result = await createPhilipsRichContent([{ imageUrl: "https://images.philips.com/is/image/philipsconsumer/one", title: "Birinci başlık", text: "Birinci açıklama" }, { imageUrl: "https://images.philips.com/is/image/philipsconsumer/two", title: "İkinci başlık", text: "İkinci açıklama" }]); expect(fetchMock).toHaveBeenCalledTimes(1); expect(result.content[0].blocks).toHaveLength(2); expect(result.content[0].blocks[1].title.items[0].content).toBe("Второй заголовок"); } finally { fetchMock.mockRestore(); if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; if (previousModel === undefined) delete process.env.OPENAI_TEXT_MODEL; else process.env.OPENAI_TEXT_MODEL = previousModel; } }); });
describe("IKEA Rich Content", () => {
  const copy = {
    headline: "HACKIG — набор ножей",
    benefits: Array.from({ length: 6 }, (_, index) => ({ title: `Преимущество ${index + 1}`, description: `Подробное описание преимущества номер ${index + 1}, основанное на фактах о товаре и объясняющее практическую пользу для покупателя.` })),
    specifications: [{ label: "Материал", value: "Керамика" }],
  };
  const product = (imageCount: number): IkeaProduct => ({
    brand: "ikea", productCode: "105.984.85", modelName: "HACKIG", fullName: "HACKIG bıçak seti",
    sourceUrl: "https://www.ikea.com.tr/urun/test-10598485", description: "Üç seramik bıçak.",
    images: Array.from({ length: imageCount }, (_, index) => ({ url: `https://image-ikea.test/${index}.jpg`, order: index })),
  });
  it("görsel sayısına göre şablon seçer", () => {
    expect(selectIkeaRichContentTemplate(8)).toBe("gallery");
    expect(selectIkeaRichContentTemplate(5)).toBe("chess");
    expect(selectIkeaRichContentTemplate(3)).toBe("compact");
  });
  it("çok görselde tileL, az görselde liste ve metin kartı üretir", () => {
    const gallery = createIkeaRichContent(product(8), copy);
    expect(gallery.content.map((widget) => widget.widgetName)).toEqual(["raShowcase", "raShowcase", "raShowcase"]);
    expect(gallery.content[2]).toMatchObject({ type: "tileL" });
    expect(gallery.content[0]).toMatchObject({ blocks: [{ img: { src: "https://ir-20.ozone.ru/s3/multimedia-1-d/ww1200/14789671717.jpg" } }] });
    const compact = createIkeaRichContent(product(2), copy);
    expect(compact.content.some((widget) => widget.widgetName === "list")).toBe(true);
    expect(compact.content.some((widget) => widget.widgetName === "raTextBlock")).toBe(true);
  });
});
describe("dosya adı", () => it("tehlikeli karakterleri temizler", () => expect(sanitizeFilename("../ürün <01>.jpg")).toBe("urun-01-.jpg")));
describe("yerleşim", () => { it("oranı koruyarak sığdırır", () => expect(containSize(1000, 1000, 700, 950)).toEqual({ width: 700, height: 700 })); it("ortalar", () => expect(centeredPlacement(1000, 500, 25, 25, 700, 950)).toEqual({ width: 700, height: 350, left: 25, top: 325 })); });
describe("metin", () => it("uzun adı en fazla iki satıra böler", () => expect(fitProductName("ÇOK UZUN BİR IKEA ÜRÜN MODEL ADI", 240, 44, 20).lines.length).toBeLessThanOrEqual(2)));
describe("model adı", () => { it("IKEA seri adındaki ikinci parçayı korur", () => expect(extractModelName("IKEA 365+ Kavanoz, cam")).toBe("IKEA 365+")); it("tek kelimelik model adlarını korur", () => expect(extractModelName("KALLAX Raf ünitesi, beyaz")).toBe("KALLAX")); });
describe("görsel URL'leri", () => it("tekrarları, küçük sürümleri ve logoları kaldırır", () => { const result = deduplicateImageUrls([{ url: "https://image-ikea.test/urunler/500_500/a.jpg" }, { url: "https://image-ikea.test/urunler/2000_2000/a.jpg" }, { url: "https://images.ikea.com/logo.png" }]); expect(result).toHaveLength(1); expect(result[0].url).toContain("2000_2000"); }));
describe("video zamanlaması", () => { it("seçilen süreyi görsellere eşit böler", () => { const count = 6; const duration = 23; const slide = calculateSlideDuration(count, duration); expect(count * slide - (count - 1) * TRANSITION_SECONDS).toBeCloseTo(duration, 8); }); it("10 saniyeden kısa videoyu reddeder", () => expect(() => calculateSlideDuration(4, 9)).toThrow()); });
