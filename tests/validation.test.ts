import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createJobSchema, isAllowedIkeaUrl, isAllowedPhilipsHueUrl, isAllowedPhilipsUrl, normalizeProductCode } from "@/lib/validation";
import { sanitizeFilename } from "@/lib/filename";
import { sanitizeOzonText } from "@/lib/ozonText";
import { centeredPlacement, containSize } from "@/lib/image-layout";
import { deduplicateImageUrls } from "@/services/ikea/imageExtractor";
import { extractModelName } from "@/services/ikea/ikeaScraper";
import { fitProductName } from "@/services/images/textRenderer";
import { calculateSlideDuration, TRANSITION_SECONDS } from "@/services/video/videoCreator";
import { downloadImages } from "@/services/images/downloader";
import { brandClosingImageFilename } from "@/services/images/brandClosingImage";
import { canonicalizePhilipsFeatureImage, canonicalizePhilipsImage, selectPhilipsProductImageUrls } from "@/services/philips/philipsScraper";
import { canonicalizePhilipsHueImage } from "@/services/philips-hue/philipsHueScraper";
import { createPhilipsRichContent } from "@/services/philips/richContent";
import { createIkeaRichContent, selectIkeaRichContentTemplate } from "@/services/ikea/richContent";
import type { IkeaProduct } from "@/types";
import { findInternationalDeliveryTypes, formatAccrualDate, parsePostingNumbers, translatePostingStatus } from "@/services/ozon/shippingFees";

describe("ürün kodu", () => { it("normalize eder", () => { expect(normalizeProductCode("806 264 18")).toBe("806.264.18"); expect(normalizeProductCode("80626418")).toBe("806.264.18"); }); it("geçersiz kodu reddeder", () => expect(normalizeProductCode("123")).toBeNull()); });
describe("URL güvenliği", () => { it("IKEA alan adlarını kabul eder", () => { expect(isAllowedIkeaUrl("https://www.ikea.com.tr/urun/test-80626418")).toBe(true); expect(isAllowedIkeaUrl("https://ikea.de/de/p/test")).toBe(true); }); it("yanıltıcı ve güvensiz adresleri reddeder", () => { expect(isAllowedIkeaUrl("https://ikea.com.evil.test/x")).toBe(false); expect(isAllowedIkeaUrl("http://ikea.com/x")).toBe(false); }); });
describe("Philips doğrulaması", () => { it("yalnızca resmi Türkiye ürün linkini kabul eder", () => { const url = "https://www.philips.com.tr/c-p/QP2824_10/oneblade-yuez-ve-vuecut"; expect(isAllowedPhilipsUrl(url)).toBe(true); expect(createJobSchema.safeParse({ brand: "philips", input: url }).success).toBe(true); expect(isAllowedPhilipsUrl("https://www.philips.com.tr/support/test")).toBe(false); expect(isAllowedPhilipsUrl("https://philips.com.tr.evil.test/c-p/test")).toBe(false); }); it("görselleri uygun Philips CDN adreslerine dönüştürür", () => { expect(canonicalizePhilipsImage("https://images.philips.com/is/image/philipsconsumer/abc?$png$&wid=410")).toBe("https://images.philips.com/is/image/philipsconsumer/abc?$png$&wid=1200&hei=1200&fit=constrain"); expect(canonicalizePhilipsFeatureImage("https://images.philips.com/is/image/philipsconsumer/card?$png$&wid=400")).toBe("https://images.philips.com/is/image/philipsconsumer/card?$png$&wid=1200"); }); it("Philips galerisinde farklı alt metinli ürün görsellerini korur", () => { const result = selectPhilipsProductImageUrls("https://images.philips.com/is/image/philipsconsumer/primary?$png$&wid=450", [{ src: "https://images.philips.com/is/image/philipsconsumer/primary?$png$&wid=120", isFeature: false, isProductGallery: true }, { src: "https://images.philips.com/is/image/philipsconsumer/side?$png$&wid=120", isFeature: false, isProductGallery: true }, { src: "https://images.philips.com/is/image/philipsconsumer/accessory?$png$&wid=120", isFeature: false, isProductGallery: false }, { src: "https://images.philips.com/is/image/philipsconsumer/feature?$png$&wid=120", isFeature: true, isProductGallery: false }]); expect(result).toEqual(["https://images.philips.com/is/image/philipsconsumer/primary?$png$&wid=1200&hei=1200&fit=constrain", "https://images.philips.com/is/image/philipsconsumer/side?$png$&wid=1200&hei=1200&fit=constrain"]); }); });
describe("Philips Hue doğrulaması", () => {
  const productUrl = "https://www.philips-hue.com/tr-tr/p/hue-white-and-color-ambiance-tek-ampul-e27/8719514291171#specifications";
  it("yalnızca resmi Türkiye ürün linkini kabul eder", () => {
    expect(isAllowedPhilipsHueUrl(productUrl)).toBe(true);
    expect(createJobSchema.safeParse({ brand: "philips-hue", input: productUrl }).success).toBe(true);
    expect(isAllowedPhilipsHueUrl("http://www.philips-hue.com/tr-tr/p/test/123")).toBe(false);
    expect(isAllowedPhilipsHueUrl("https://philips-hue.com.evil.test/tr-tr/p/test/123")).toBe(false);
    expect(isAllowedPhilipsHueUrl("https://www.philips-hue.com/tr-tr/support")).toBe(false);
  });
  it("Signify görsellerini 1280 × 960 ve kalite 100 adresine dönüştürür", () => {
    expect(canonicalizePhilipsHueImage("https://www.assets.signify.com/is/image/Signify/8719514291171-929002468801-Hue_WCA-A60-E27-on-TRN?wid=768&hei=576&qlt=82")).toBe("https://www.assets.signify.com/is/image/Signify/8719514291171-929002468801-Hue_WCA-A60-E27-on-TRN?wid=1280&hei=960&qlt=100");
    expect(canonicalizePhilipsHueImage("https://assets.signify.com/is/image/Signify/test?wid=768")).toBeNull();
  });
});
describe("Philips Rich Content", () => { it("özellik kartını Ozon şemasında Rusça tileL bloğuna dönüştürür", async () => { const result = await createPhilipsRichContent([{ imageUrl: "https://images.philips.com/is/image/philipsconsumer/card?$png$&wid=1416", title: "Tüm bakım ihtiyaçlarınız için 9 başlık", text: "Erkek bakım setimiz, sakalınızı kısaltmanız ve şekillendirmeniz, saçınızı kısaltmanız ve vücut bakımınızı yapmanız için 9 farklı başlıkla birlikte gelir; böylece kişisel bakım ihtiyaçlarınızın tümünü kolayca karşılar." }]); expect(result.version).toBe(0.3); expect(result.content[0]).toMatchObject({ widgetName: "raShowcase", type: "tileL" }); expect(result.content[0].blocks[0].title.items[0].content).toBe("9 насадок для всех ваших потребностей по уходу"); expect(result.content[0].blocks[0].img.widthMobile).toBe(400); }); it("orijinal iddiasını Rich Content metninden kaldırır", async () => { const result = await createPhilipsRichContent([{ imageUrl: "https://images.philips.com/is/image/philipsconsumer/card?$png$&wid=1416", title: "Orijinal teknoloji", text: "Orjinal parça uyumu sağlar." }], async (value) => value.includes("teknoloji") ? "Оригинальная технология OneUp" : "Оригинал обеспечивает совместимость."); const block = result.content[0].blocks[0]; expect(block.title.items[0].content).toBe("технология OneUp"); expect(block.text.items[0].content).toBe("обеспечивает совместимость."); }); });
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
describe("Ozon metin kuralları", () => { it("orijinal iddiasını başlık ve açıklamalardan temizler", () => { expect(sanitizeOzonText("Orijinal OneUp patentli teknolojisi")).toBe("OneUp patentli teknolojisi"); expect(sanitizeOzonText("Оригинальная технология OneUp")).toBe("технология OneUp"); expect(sanitizeOzonText("Original design, güçlü kullanım")).toBe("design, güçlü kullanım"); }); });
describe("yerleşim", () => { it("oranı koruyarak sığdırır", () => expect(containSize(1000, 1000, 700, 950)).toEqual({ width: 700, height: 700 })); it("ortalar", () => expect(centeredPlacement(1000, 500, 25, 25, 700, 950)).toEqual({ width: 700, height: 350, left: 25, top: 325 })); });
describe("metin", () => it("uzun adı en fazla iki satıra böler", () => expect(fitProductName("ÇOK UZUN BİR IKEA ÜRÜN MODEL ADI", 240, 44, 20).lines.length).toBeLessThanOrEqual(2)));
describe("model adı", () => { it("IKEA seri adındaki ikinci parçayı korur", () => expect(extractModelName("IKEA 365+ Kavanoz, cam")).toBe("IKEA 365+")); it("tek kelimelik model adlarını korur", () => expect(extractModelName("KALLAX Raf ünitesi, beyaz")).toBe("KALLAX")); });
describe("görsel URL'leri", () => it("tekrarları, küçük sürümleri ve logoları kaldırır", () => { const result = deduplicateImageUrls([{ url: "https://image-ikea.test/urunler/500_500/a.jpg" }, { url: "https://image-ikea.test/urunler/2000_2000/a.jpg" }, { url: "https://images.ikea.com/logo.png" }]); expect(result).toHaveLength(1); expect(result[0].url).toContain("2000_2000"); }));
describe("görsel indirme", () => { it("geçici hatayı tekrar deneyip sırayı korur", async () => { const dir = await mkdtemp(path.join(tmpdir(), "omega-images-")); const attempts = new Map<string, number>(); const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => { const url = String(input); attempts.set(url, (attempts.get(url) || 0) + 1); if (url.endsWith("/first") && attempts.get(url) === 1) return new Response("bad gateway", { status: 502 }); return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png", "content-length": "3" } }); }); try { const result = await downloadImages(["https://image.test/first", "https://image.test/second"], dir); expect(result.map((item) => path.basename(item))).toEqual(["01.source", "02.source"]); expect(attempts.get("https://image.test/first")).toBe(2); } finally { fetchMock.mockRestore(); await rm(dir, { recursive: true, force: true }); } }); });
describe("marka kapanış görseli", () => { it("IKEA ve Philips markalarını doğru dosyaya eşler", () => { expect(brandClosingImageFilename("ikea")).toBe("ikea-son.png"); expect(brandClosingImageFilename("philips")).toBe("philips-son.png"); expect(brandClosingImageFilename("philips-hue")).toBe("philips-son.png"); }); });
describe("video zamanlaması", () => { it("seçilen süreyi görsellere eşit böler", () => { const count = 6; const duration = 23; const slide = calculateSlideDuration(count, duration); expect(count * slide - (count - 1) * TRANSITION_SECONDS).toBeCloseTo(duration, 8); }); it("10 saniyeden kısa videoyu reddeder", () => expect(() => calculateSlideDuration(4, 9)).toThrow()); });
describe("Ozon kargo raporu", () => {
  it("sipariş numaralarını ayırır ve tekrarları kaldırır", () => {
    expect(parsePostingNumbers('"123-1\\\n123-2, 123-1"')).toEqual(["123-1", "123-2"]);
    expect(parsePostingNumbers("123-1\\n123-2")).toEqual(["123-1", "123-2"]);
  });
  it("uluslararası teslimat tahakkuk türünü farklı dillerde bulur", () => {
    const types = [{ id: 10, name: "InternationalDelivery", description: "International delivery service" }, { id: 20, name: "Acquiring", description: "Ödeme alma" }];
    expect(findInternationalDeliveryTypes(types).map((type) => type.id)).toEqual([10]);
  });
  it("durumları Türkçeleştirir ve tarihi gün-ay-yıl biçimine getirir", () => {
    expect(translatePostingStatus("delivered")).toBe("Teslim Edildi");
    expect(translatePostingStatus("cancelled")).toBe("İptal Edildi");
    expect(formatAccrualDate("2026-10-08T12:30:00Z")).toBe("08.10.2026");
  });
});
