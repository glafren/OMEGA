import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { POST } from "@/app/api/ozon/shipping-fees/route";
import { fetchShippingComparisonFees } from "@/services/ozon/comparisonWorkbook";
import { fetchUsdRubRate, parseCbrUsdRate } from "@/services/ozon/exchangeRates";
import { createShippingFeeReport } from "@/services/ozon/shippingFees";

function cbrXml(rateDate = "07.10.2026", value = "96,5000") {
  return `<?xml version="1.0" encoding="windows-1251"?><ValCurs Date="${rateDate}" name="Foreign Currency Market"><Valute ID="R01010"><NumCode>036</NumCode><CharCode>AUD</CharCode><Nominal>1</Nominal><Name>Australian Dollar</Name><Value>59,2551</Value><VunitRate>59,2551</VunitRate></Valute><Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>US Dollar</Name><Value>${value}</Value><VunitRate>${value}</VunitRate></Valute></ValCurs>`;
}

function cbrResponse(rateDate?: string, value?: string) {
  return new Response(cbrXml(rateDate, value), { headers: { "content-type": "application/xml; charset=windows-1251" } });
}

describe("Ozon kargo kesinti raporu", () => {
  const previousClientId = process.env.OZON_OMEGA_CLIENT_ID;
  const previousApiKey = process.env.OZON_OMEGA_API_KEY;
  const previousInterval = process.env.OZON_API_MIN_INTERVAL_MS;
  const previousRetryBase = process.env.OZON_API_RETRY_BASE_MS;
  const previousGoogleRetryBase = process.env.GOOGLE_SHEET_RETRY_BASE_MS;
  const previousCbrRetryBase = process.env.CBR_RATE_RETRY_BASE_MS;
  let comparisonBuffer: Awaited<ReturnType<ExcelJS.Workbook["xlsx"]["writeBuffer"]>>;

  beforeEach(async () => {
    process.env.OZON_OMEGA_CLIENT_ID = "client-id";
    process.env.OZON_OMEGA_API_KEY = "api-key";
    process.env.OZON_API_MIN_INTERVAL_MS = "0";
    process.env.OZON_API_RETRY_BASE_MS = "0";
    process.env.GOOGLE_SHEET_RETRY_BASE_MS = "0";
    process.env.CBR_RATE_RETRY_BASE_MS = "0";
    const comparisonWorkbook = new ExcelJS.Workbook();
    comparisonWorkbook.addWorksheet("Ücretler").addRows([
      ["Ürün Kodu", "Kargo Ücreti (USD)"],
      ["URUN-001", 3.5],
      ["URUN-ALT", 1],
    ]);
    comparisonBuffer = await comparisonWorkbook.xlsx.writeBuffer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousClientId === undefined) delete process.env.OZON_OMEGA_CLIENT_ID; else process.env.OZON_OMEGA_CLIENT_ID = previousClientId;
    if (previousApiKey === undefined) delete process.env.OZON_OMEGA_API_KEY; else process.env.OZON_OMEGA_API_KEY = previousApiKey;
    if (previousInterval === undefined) delete process.env.OZON_API_MIN_INTERVAL_MS; else process.env.OZON_API_MIN_INTERVAL_MS = previousInterval;
    if (previousRetryBase === undefined) delete process.env.OZON_API_RETRY_BASE_MS; else process.env.OZON_API_RETRY_BASE_MS = previousRetryBase;
    if (previousGoogleRetryBase === undefined) delete process.env.GOOGLE_SHEET_RETRY_BASE_MS; else process.env.GOOGLE_SHEET_RETRY_BASE_MS = previousGoogleRetryBase;
    if (previousCbrRetryBase === undefined) delete process.env.CBR_RATE_RETRY_BASE_MS; else process.env.CBR_RATE_RETRY_BASE_MS = previousCbrRetryBase;
  });

  it("yalnızca teslim edilen siparişin uluslararası teslimat kesintisini dolara çevirir", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body || "{}"));
      if (url.endsWith("/v1/finance/accrual/types")) return Response.json({ accrual_types: [{ id: 91, name: "InternationalDelivery", description: "International delivery service" }] });
      if (url.endsWith("/v3/posting/fbs/get")) return Response.json({ result: { status: body.posting_number === "ORDER-1" ? "delivered" : body.posting_number === "ORDER-2" ? "delivering" : "cancelled", products: body.posting_number === "ORDER-1" ? [{ offer_id: "URUN-001", sku: 10, quantity: 2 }, { offer_id: "URUN-ALT", sku: 11, quantity: 3 }] : [{ offer_id: `URUN-00${body.posting_number.slice(-1)}`, sku: 10, quantity: 1 }] } });
      if (url.endsWith("/v1/finance/accrual/postings")) return Response.json({ posting_accruals: [{ posting_number: "ORDER-1", accruals: [{ type_id: 91, sku: 10, accrual_date: "2026-10-07", accrued: { amount: "-965", currency: "RUB" } }, { type_id: 91, sku: 11, accrual_date: "2026-10-07", accrued: { amount: "-193", currency: "RUB" } }] }] });
      if (url.startsWith("https://www.cbr.ru/scripts/XML_daily_eng.asp")) return cbrResponse();
      return new Response(null, { status: 404 });
    });

    const rows = await createShippingFeeReport("omega", ["ORDER-1", "ORDER-2", "ORDER-3"], undefined, new Map([["URUN-001", 12], ["URUN-ALT", 1]]));
    expect(rows[0]).toMatchObject({ status: "Teslim Edildi", productCode: "URUN-001", quantity: 2, accrualDate: "07.10.2026", delivered: true, feeAmount: 965, usdRate: 96.5, feeUsd: 10, comparisonFeeUsd: 12, feeDifferenceUsd: 14, currency: "RUB" });
    expect(rows[1]).toMatchObject({ postingNumber: "ORDER-1", productCode: "URUN-ALT", quantity: 3, feeAmount: 193, feeUsd: 2, comparisonFeeUsd: 1, feeDifferenceUsd: 1 });
    expect(rows[2]).toMatchObject({ status: "Yolda", accrualDate: "Yolda", productCode: "URUN-002", delivered: false, feeAmount: null, feeUsd: null });
    expect(rows[3]).toMatchObject({ status: "İptal Edildi", accrualDate: "İptal Edildi", productCode: "URUN-003", delivered: false });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("tahakkuk günündeki resmî CBR kurunu ve hafta sonu geçerli kur tarihini okur", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(cbrResponse("05.09.2026", "86,5857"));
    const rate = await fetchUsdRubRate("2026-09-06");
    expect(rate).toEqual({ requestedDate: "2026-09-06", effectiveDate: "2026-09-05", rubPerUsd: 86.5857 });
    expect(fetchMock).toHaveBeenCalledWith("https://www.cbr.ru/scripts/XML_daily_eng.asp?date_req=06/09/2026", expect.objectContaining({ cache: "no-store" }));
  });

  it("CBR XML'indeki önceki para birimini USD kuru sanmaz", () => {
    expect(parseCbrUsdRate(cbrXml("13.10.2026", "83,9153"), "2026-10-13").rubPerUsd).toBe(83.9153);
  });

  it("12.10.2026 tahakkuku için 13.10.2026'dan geçerli CBR kurunu kullanır", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/finance/accrual/types")) return Response.json({ accrual_types: [{ id: 91, name: "InternationalDelivery" }] });
      if (url.endsWith("/v3/posting/fbs/get")) return Response.json({ result: { status: "delivered", products: [{ offer_id: "URUN-001", sku: 10, quantity: 1 }] } });
      if (url.endsWith("/v1/finance/accrual/postings")) return Response.json({ posting_accruals: [{ posting_number: "12366559-0206-1", accruals: [{ type_id: 91, sku: 10, accrual_date: "2026-10-12", accrued: { amount: "-839.153", currency: "RUB" } }] }] });
      if (url.includes("date_req=13/10/2026")) return cbrResponse("13.10.2026", "83,9153");
      return new Response(null, { status: 404 });
    });

    const [row] = await createShippingFeeReport("omega", ["12366559-0206-1"]);
    expect(row).toMatchObject({ accrualDate: "12.10.2026", usdRate: 83.9153, feeUsd: 10 });
    expect(fetchMock).toHaveBeenCalledWith("https://www.cbr.ru/scripts/XML_daily_eng.asp?date_req=13/10/2026", expect.any(Object));
  });

  it("farklı tahakkuk günlerindeki RUB tutarlarını kendi CBR kurlarıyla çevirir", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/finance/accrual/types")) return Response.json({ accrual_types: [{ id: 91, name: "InternationalDelivery" }] });
      if (url.endsWith("/v3/posting/fbs/get")) return Response.json({ result: { status: "delivered", products: [{ offer_id: "URUN-001", sku: 10, quantity: 1 }] } });
      if (url.endsWith("/v1/finance/accrual/postings")) return Response.json({ posting_accruals: [{ posting_number: "ORDER-MIXED-DATES", accruals: [
        { type_id: 91, sku: 10, accrual_date: "2026-10-08", accrued: { amount: "-96.5", currency: "RUB" } },
        { type_id: 91, sku: 10, accrual_date: "2026-10-09", accrued: { amount: "-100", currency: "RUB" } },
      ] }] });
      if (url.includes("date_req=09/10/2026")) return cbrResponse("09.10.2026", "96,5000");
      if (url.includes("date_req=10/10/2026")) return cbrResponse("10.10.2026", "100,0000");
      return new Response(null, { status: 404 });
    });

    const [row] = await createShippingFeeReport("omega", ["ORDER-MIXED-DATES"]);
    expect(row).toMatchObject({ feeAmount: 196.5, feeUsd: 2, usdRate: 98.25, accrualDate: "08.10.2026, 09.10.2026" });
  });

  it("Google tablosunu geçici ağ hatasında tekrar dener ve son başarılı veriyi yedekler", async () => {
    let attempts = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      attempts++;
      if (attempts === 1) return new Response(comparisonBuffer as BodyInit);
      throw new TypeError("temporary network failure");
    });

    const fresh = await fetchShippingComparisonFees("omega");
    const cached = await fetchShippingComparisonFees("omega");
    expect(fresh.get("URUN-001")).toBe(3.5);
    expect(cached.get("URUN-001")).toBe(3.5);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("iptal ve tahakkuku ürüne bağlanamayan çok ürünlü siparişlerde Google tahminini kullanır", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body || "{}"));
      if (url.endsWith("/v1/finance/accrual/types")) return Response.json({ accrual_types: [{ id: 91, name: "InternationalDelivery" }] });
      if (url.endsWith("/v3/posting/fbs/get")) return Response.json({ result: {
        status: body.posting_number === "CANCELLED" ? "cancelled" : "delivered",
        products: body.posting_number === "CANCELLED"
          ? [{ offer_id: "URUN-001", sku: 10, quantity: 2 }]
          : [{ offer_id: "URUN-001", sku: 10, quantity: 2 }, { offer_id: "URUN-ALT", sku: 11, quantity: 3 }],
      } });
      if (url.endsWith("/v1/finance/accrual/postings")) return Response.json({ posting_accruals: [{ posting_number: "MULTI", accruals: [{ type_id: 91, accrued: { amount: "-965", currency: "RUB" } }] }] });
      return new Response(null, { status: 404 });
    });

    const rows = await createShippingFeeReport("omega", ["MULTI", "CANCELLED"], undefined, new Map([["URUN-001", 3.5], ["URUN-ALT", 1]]));
    expect(rows[0]).toMatchObject({ postingNumber: "MULTI", productCode: "URUN-001", quantity: 2, feeAmount: null, feeUsd: 7, feeDifferenceUsd: null });
    expect(rows[1]).toMatchObject({ postingNumber: "MULTI", productCode: "URUN-ALT", quantity: 3, feeAmount: null, feeUsd: 3, feeDifferenceUsd: null });
    expect(rows[2]).toMatchObject({ postingNumber: "CANCELLED", status: "İptal Edildi", quantity: 2, feeAmount: null, feeUsd: 7, feeDifferenceUsd: null });
    expect(rows.every((row) => row.note.includes("tahmini kargo ücreti kullanıldı"))).toBe(true);
  });

  it("Google tablosundaki ürün ücretlerini XLSX raporunda kıyaslar", async () => {
    const source = new ExcelJS.Workbook();
    const sourceSheet = source.addWorksheet("Ücretler");
    sourceSheet.addRows([["Ürün Kodu", "Kargo Ücreti (USD)"], ["URUN-001", 3.5]]);
    const sourceBuffer = await source.xlsx.writeBuffer();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://docs.google.com/spreadsheets/d/1QDoYFvcWtyUJ_PZfqYyu0BSCNAY157pPom5WIvcRJT4/export?format=xlsx") {
        return new Response(sourceBuffer as BodyInit, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
      }
      if (url.endsWith("/v1/finance/accrual/types")) return Response.json({ accrual_types: [{ id: 91, name: "InternationalDelivery" }] });
      if (url.endsWith("/v3/posting/fbs/get")) return Response.json({ result: { status: "delivered", products: [{ offer_id: "URUN-001", quantity: 3 }] } });
      if (url.endsWith("/v1/finance/accrual/postings")) return Response.json({ posting_accruals: [{ posting_number: "ORDER-1", accruals: [{ type_id: 91, accrual_date: "2026-10-07", accrued: { amount: "-193", currency: "RUB" } }] }] });
      if (url.startsWith("https://www.cbr.ru/scripts/XML_daily_eng.asp")) return cbrResponse();
      return new Response(null, { status: 404 });
    });
    const form = new FormData();
    form.set("store", "omega"); form.set("postingNumbers", "ORDER-1"); form.set("comparisonEnabled", "true");
    const response = await POST(new Request("http://localhost/api/ozon/shipping-fees", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    const output = new ExcelJS.Workbook();
    await output.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
    const sheet = output.getWorksheet("Kargo Kesintileri");
    expect(sheet?.getCell("E2").value).toBe(3);
    expect(sheet?.getCell("I1").value).toBe("Kullanıcı Kargo Ücreti (USD/Adet)");
    expect(sheet?.getCell("I2").value).toBe(3.5);
    expect(sheet?.getCell("J1").value).toBe("Fark (Tanımlı Toplam - Kesilen USD)");
    expect(sheet?.getCell("J2").value).toBe(8.5);
    expect(sheet?.getCell("J2").numFmt).toBe('+$#,##0.00;-$#,##0.00;$0.00');
    expect(sheet?.getCell("K1").value).toBe("Açıklama");
  });

  it("kıyaslama kapalıyken iptal siparişin tahmini ücretini XLSX raporuna yazar", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("docs.google.com/spreadsheets")) return new Response(comparisonBuffer as BodyInit);
      if (url.endsWith("/v1/finance/accrual/types")) return Response.json({ accrual_types: [{ id: 91, name: "InternationalDelivery" }] });
      if (url.endsWith("/v3/posting/fbs/get")) return Response.json({ result: { status: "cancelled", products: [{ offer_id: "URUN-001", quantity: 2 }] } });
      return new Response(null, { status: 404 });
    });
    const form = new FormData();
    form.set("store", "omega"); form.set("postingNumbers", "CANCELLED"); form.set("comparisonEnabled", "false");
    const response = await POST(new Request("http://localhost/api/ozon/shipping-fees", { method: "POST", body: form }));
    const output = new ExcelJS.Workbook();
    await output.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
    const sheet = output.getWorksheet("Kargo Kesintileri");
    expect(sheet?.getCell("H2").value).toBe(7);
    expect(sheet?.getCell("I1").value).toBe("Açıklama");
    expect(sheet?.getCell("I2").value).toContain("tahmini kargo ücreti kullanıldı");
  });

  it("rapor aşamalarını canlı iletir ve tamamlanan Excel'i gönderir", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("docs.google.com/spreadsheets")) return new Response(comparisonBuffer as BodyInit);
      if (url.endsWith("/v1/finance/accrual/types")) return Response.json({ accrual_types: [{ id: 91, name: "InternationalDelivery" }] });
      if (url.endsWith("/v3/posting/fbs/get")) return Response.json({ result: { status: "delivered", products: [{ offer_id: "URUN-001", quantity: 1 }] } });
      if (url.endsWith("/v1/finance/accrual/postings")) return Response.json({ posting_accruals: [{ posting_number: "ORDER-1", accruals: [{ type_id: 91, accrual_date: "2026-10-07", accrued: { amount: "-193", currency: "RUB" } }] }] });
      if (url.startsWith("https://www.cbr.ru/scripts/XML_daily_eng.asp")) return cbrResponse();
      return new Response(null, { status: 404 });
    });
    const form = new FormData();
    form.set("store", "omega"); form.set("postingNumbers", "ORDER-1"); form.set("comparisonEnabled", "false");
    const response = await POST(new Request("http://localhost/api/ozon/shipping-fees", { method: "POST", headers: { Accept: "application/x-ndjson" }, body: form }));
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string; value?: number; stage?: string; content?: string });
    expect(events.some((event) => event.stage?.includes("Siparişler sorgulanıyor"))).toBe(true);
    expect(events.some((event) => event.stage?.includes("Teslimat tahakkukları alınıyor"))).toBe(true);
    const complete = events.at(-1);
    expect(complete).toMatchObject({ type: "complete", value: 100, stage: "Rapor hazır" });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(complete?.content || "", "base64") as never);
    expect(workbook.getWorksheet("Kargo Kesintileri")?.getCell("B2").value).toBe("ORDER-1");
  });

  it("ilerleme akışı kapatıldığında aktif Ozon isteğini iptal eder", async () => {
    let requestAborted = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const signal = init?.signal;
      return await new Promise<Response>((_resolve, reject) => {
        const abort = () => { requestAborted = true; reject(new DOMException("Aborted", "AbortError")); };
        if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
      });
    });
    const form = new FormData();
    form.set("store", "omega"); form.set("postingNumbers", "ORDER-1"); form.set("comparisonEnabled", "false");
    const response = await POST(new Request("http://localhost/api/ozon/shipping-fees", { method: "POST", headers: { Accept: "application/x-ndjson" }, body: form }));
    const reader = response.body?.getReader();
    await reader?.read();
    await reader?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requestAborted).toBe(true);
  });

  it("açılabilir XLSX raporu üretir", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("docs.google.com/spreadsheets")) return new Response(comparisonBuffer as BodyInit);
      if (url.endsWith("/v1/finance/accrual/types")) return Response.json({ accrual_types: [{ id: 91, name: "InternationalDelivery", description: "International delivery service" }] });
      if (url.endsWith("/v3/posting/fbs/get")) return Response.json({ result: { status: "delivered", products: [{ offer_id: "URUN-001" }] } });
      if (url.endsWith("/v1/finance/accrual/postings")) return Response.json({ posting_accruals: [{ posting_number: "ORDER-1", accruals: [{ type_id: 91, accrual_date: "2026-10-08", accrued: { amount: "-193", currency: "RUB" } }] }] });
      if (url.startsWith("https://www.cbr.ru/scripts/XML_daily_eng.asp")) return cbrResponse("08.10.2026");
      return new Response(null, { status: 404 });
    });
    const response = await POST(new Request("http://localhost/api/ozon/shipping-fees", { method: "POST", body: JSON.stringify({ store: "omega", postingNumbers: "ORDER-1" }) }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
    const sheet = workbook.getWorksheet("Kargo Kesintileri");
    expect(sheet?.getCell("B2").value).toBe("ORDER-1");
    expect(sheet?.getCell("C2").value).toBe("08.10.2026");
    expect(sheet?.getCell("D2").value).toBe("URUN-001");
    expect(sheet?.getCell("E2").value).toBe(1);
    expect(sheet?.getCell("G1").value).toBe("CBR USD Kuru (RUB)");
    expect(sheet?.getCell("G2").value).toBe(96.5);
    expect(sheet?.getCell("H2").value).toBe(2);
  });

  it("429 yanıtından sonra isteği otomatik tekrarlar", async () => {
    let typeAttempts = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/finance/accrual/types") && typeAttempts++ === 0) return Response.json({ message: "rate limit" }, { status: 429, headers: { "Retry-After": "0" } });
      if (url.endsWith("/v1/finance/accrual/types")) return Response.json({ accrual_types: [{ id: 91, name: "InternationalDelivery" }] });
      if (url.endsWith("/v3/posting/fbs/get")) return Response.json({ result: { status: "delivering" } });
      return new Response(null, { status: 404 });
    });
    const rows = await createShippingFeeReport("omega", ["ORDER-1"]);
    expect(rows[0].status).toBe("Yolda");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
