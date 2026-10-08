import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { POST } from "@/app/api/ozon/shipping-fees/route";
import { createShippingFeeReport } from "@/services/ozon/shippingFees";

describe("Ozon kargo kesinti raporu", () => {
  const previousClientId = process.env.OZON_OMEGA_CLIENT_ID;
  const previousApiKey = process.env.OZON_OMEGA_API_KEY;
  const previousInterval = process.env.OZON_API_MIN_INTERVAL_MS;
  const previousRetryBase = process.env.OZON_API_RETRY_BASE_MS;

  beforeEach(() => {
    process.env.OZON_OMEGA_CLIENT_ID = "client-id";
    process.env.OZON_OMEGA_API_KEY = "api-key";
    process.env.OZON_API_MIN_INTERVAL_MS = "0";
    process.env.OZON_API_RETRY_BASE_MS = "0";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousClientId === undefined) delete process.env.OZON_OMEGA_CLIENT_ID; else process.env.OZON_OMEGA_CLIENT_ID = previousClientId;
    if (previousApiKey === undefined) delete process.env.OZON_OMEGA_API_KEY; else process.env.OZON_OMEGA_API_KEY = previousApiKey;
    if (previousInterval === undefined) delete process.env.OZON_API_MIN_INTERVAL_MS; else process.env.OZON_API_MIN_INTERVAL_MS = previousInterval;
    if (previousRetryBase === undefined) delete process.env.OZON_API_RETRY_BASE_MS; else process.env.OZON_API_RETRY_BASE_MS = previousRetryBase;
  });

  it("yalnızca teslim edilen siparişin uluslararası teslimat kesintisini dolara çevirir", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body || "{}"));
      if (url.endsWith("/v1/finance/accrual/types")) return Response.json({ accrual_types: [{ id: 91, name: "InternationalDelivery", description: "International delivery service" }] });
      if (url.endsWith("/v3/posting/fbs/get")) return Response.json({ result: { status: body.posting_number === "ORDER-1" ? "delivered" : body.posting_number === "ORDER-2" ? "delivering" : "cancelled", products: body.posting_number === "ORDER-1" ? [{ offer_id: "URUN-001", sku: 10, quantity: 2 }, { offer_id: "URUN-ALT", sku: 11, quantity: 3 }] : [{ offer_id: `URUN-00${body.posting_number.slice(-1)}`, sku: 10, quantity: 1 }] } });
      if (url.endsWith("/v1/finance/accrual/postings")) return Response.json({ posting_accruals: [{ posting_number: "ORDER-1", accruals: [{ type_id: 91, sku: 10, accrual_date: "2026-10-07", accrued: { amount: "-965", currency: "RUB" } }, { type_id: 91, sku: 11, accrual_date: "2026-10-07", accrued: { amount: "-193", currency: "RUB" } }] }] });
      return new Response(null, { status: 404 });
    });

    const rows = await createShippingFeeReport("omega", ["ORDER-1", "ORDER-2", "ORDER-3"], 96.5, undefined, new Map([["URUN-001", 12], ["URUN-ALT", 1]]));
    expect(rows[0]).toMatchObject({ status: "Teslim Edildi", productCode: "URUN-001", quantity: 2, accrualDate: "07.10.2026", delivered: true, feeAmount: 965, feeUsd: 10, comparisonFeeUsd: 12, feeDifferenceUsd: 14, currency: "RUB" });
    expect(rows[1]).toMatchObject({ postingNumber: "ORDER-1", productCode: "URUN-ALT", quantity: 3, feeAmount: 193, feeUsd: 2, comparisonFeeUsd: 1, feeDifferenceUsd: 1 });
    expect(rows[2]).toMatchObject({ status: "Yolda", accrualDate: "Yolda", productCode: "URUN-002", delivered: false, feeAmount: null, feeUsd: null });
    expect(rows[3]).toMatchObject({ status: "İptal Edildi", accrualDate: "İptal Edildi", productCode: "URUN-003", delivered: false });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("yüklenen ürün ücretlerini XLSX raporunda kıyaslar", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/finance/accrual/types")) return Response.json({ accrual_types: [{ id: 91, name: "InternationalDelivery" }] });
      if (url.endsWith("/v3/posting/fbs/get")) return Response.json({ result: { status: "delivered", products: [{ offer_id: "URUN-001", quantity: 3 }] } });
      if (url.endsWith("/v1/finance/accrual/postings")) return Response.json({ posting_accruals: [{ posting_number: "ORDER-1", accruals: [{ type_id: 91, accrued: { amount: "-193", currency: "RUB" } }] }] });
      return new Response(null, { status: 404 });
    });
    const source = new ExcelJS.Workbook();
    const sourceSheet = source.addWorksheet("Ücretler");
    sourceSheet.addRows([["Ürün Kodu", "Kargo Ücreti (USD)"], ["URUN-001", 3.5]]);
    const form = new FormData();
    form.set("store", "omega"); form.set("postingNumbers", "ORDER-1"); form.set("usdRate", "96.5"); form.set("comparisonEnabled", "true");
    form.set("comparisonFile", new File([await source.xlsx.writeBuffer()], "ucretler.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
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

  it("açılabilir XLSX raporu üretir", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/finance/accrual/types")) return Response.json({ accrual_types: [{ id: 91, name: "InternationalDelivery", description: "International delivery service" }] });
      if (url.endsWith("/v3/posting/fbs/get")) return Response.json({ result: { status: "delivered", products: [{ offer_id: "URUN-001" }] } });
      if (url.endsWith("/v1/finance/accrual/postings")) return Response.json({ posting_accruals: [{ posting_number: "ORDER-1", accruals: [{ type_id: 91, accrual_date: "2026-10-08", accrued: { amount: "-193", currency: "RUB" } }] }] });
      return new Response(null, { status: 404 });
    });
    const response = await POST(new Request("http://localhost/api/ozon/shipping-fees", { method: "POST", body: JSON.stringify({ store: "omega", postingNumbers: "ORDER-1", usdRate: 96.5 }) }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
    const sheet = workbook.getWorksheet("Kargo Kesintileri");
    expect(sheet?.getCell("B2").value).toBe("ORDER-1");
    expect(sheet?.getCell("C2").value).toBe("08.10.2026");
    expect(sheet?.getCell("D2").value).toBe("URUN-001");
    expect(sheet?.getCell("E2").value).toBe(1);
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
    const rows = await createShippingFeeReport("omega", ["ORDER-1"], 96.5);
    expect(rows[0].status).toBe("Yolda");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
