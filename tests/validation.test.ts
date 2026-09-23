import { describe, expect, it } from "vitest";
import { isAllowedIkeaUrl, normalizeProductCode } from "@/lib/validation";
import { sanitizeFilename } from "@/lib/filename";
import { centeredPlacement, containSize } from "@/lib/image-layout";
import { deduplicateImageUrls } from "@/services/ikea/imageExtractor";
import { extractModelName } from "@/services/ikea/ikeaScraper";
import { fitProductName } from "@/services/images/textRenderer";
import { calculateSlideDuration, TRANSITION_SECONDS } from "@/services/video/videoCreator";

describe("ürün kodu", () => { it("normalize eder", () => { expect(normalizeProductCode("806 264 18")).toBe("806.264.18"); expect(normalizeProductCode("80626418")).toBe("806.264.18"); }); it("geçersiz kodu reddeder", () => expect(normalizeProductCode("123")).toBeNull()); });
describe("URL güvenliği", () => { it("IKEA alan adlarını kabul eder", () => { expect(isAllowedIkeaUrl("https://www.ikea.com.tr/urun/test-80626418")).toBe(true); expect(isAllowedIkeaUrl("https://ikea.de/de/p/test")).toBe(true); }); it("yanıltıcı ve güvensiz adresleri reddeder", () => { expect(isAllowedIkeaUrl("https://ikea.com.evil.test/x")).toBe(false); expect(isAllowedIkeaUrl("http://ikea.com/x")).toBe(false); }); });
describe("dosya adı", () => it("tehlikeli karakterleri temizler", () => expect(sanitizeFilename("../ürün <01>.jpg")).toBe("urun-01-.jpg")));
describe("yerleşim", () => { it("oranı koruyarak sığdırır", () => expect(containSize(1000, 1000, 700, 950)).toEqual({ width: 700, height: 700 })); it("ortalar", () => expect(centeredPlacement(1000, 500, 25, 25, 700, 950)).toEqual({ width: 700, height: 350, left: 25, top: 325 })); });
describe("metin", () => it("uzun adı en fazla iki satıra böler", () => expect(fitProductName("ÇOK UZUN BİR IKEA ÜRÜN MODEL ADI", 240, 44, 20).lines.length).toBeLessThanOrEqual(2)));
describe("model adı", () => { it("IKEA seri adındaki ikinci parçayı korur", () => expect(extractModelName("IKEA 365+ Kavanoz, cam")).toBe("IKEA 365+")); it("tek kelimelik model adlarını korur", () => expect(extractModelName("KALLAX Raf ünitesi, beyaz")).toBe("KALLAX")); });
describe("görsel URL'leri", () => it("tekrarları, küçük sürümleri ve logoları kaldırır", () => { const result = deduplicateImageUrls([{ url: "https://image-ikea.test/urunler/500_500/a.jpg" }, { url: "https://image-ikea.test/urunler/2000_2000/a.jpg" }, { url: "https://images.ikea.com/logo.png" }]); expect(result).toHaveLength(1); expect(result[0].url).toContain("2000_2000"); }));
describe("video zamanlaması", () => { it("seçilen süreyi görsellere eşit böler", () => { const count = 6; const duration = 23; const slide = calculateSlideDuration(count, duration); expect(count * slide - (count - 1) * TRANSITION_SECONDS).toBeCloseTo(duration, 8); }); it("10 saniyeden kısa videoyu reddeder", () => expect(() => calculateSlideDuration(4, 9)).toThrow()); });
