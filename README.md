# OMEGA Operasyon Merkezi

Üç operasyon aracını tek, yerel ve responsive arayüzde birleştirir:

- IKEA ürün görseli ve MP4 video oluşturma
- Sipariş bazlı IKEA stok/fiyat kontrolü ve PDF/Excel raporu
- Ozon stok şablonu oluşturma
- Sipariş Excel/CSV dosyasından yazılı ve sıralı etiket PDF'i hazırlama
- Medya, stok ve etiket işlemleri için ortak, bellek içi iş kuyruğu

## İlk kurulum

Gereksinimler: Node.js 20.9+, Python 3.10+ ve Windows.

```powershell
npm install
npm run setup
```

`npm run setup`, Python paketlerini ve Playwright Chromium'u kurar.

## Çalıştırma

En kolay yöntem `baslat.bat` dosyasına çift tıklamaktır. Alternatif:

```powershell
npm run dev
```

Uygulama: `http://localhost:3000`

Production:

```powershell
npm run build
npm start
```

## Yapı

```text
src/app/                 Next.js sayfaları ve API katmanı
src/components/          Ortak OMEGA arayüzü
src/services/            Medya oluşturma iş mantığı
backend/stock/           Mevcut stok motoru ve Excel şablonları
backend/label/           Mevcut etiket motoru ve kısa kod tablosu
tmp/                     Geçici medya işleri (git dışı)
```

Stok servisi yalnızca `127.0.0.1:8010` üzerinde dinler; tarayıcı bu servise Next.js proxy üzerinden erişir. Yüklenen etiket dosyaları sistem geçici klasöründe işlenir ve yanıt sonrası silinir.

Merkezi kuyruk varsayılan olarak aynı anda en fazla iki ağır işlem çalıştırır. Kapasite `.env.local` içindeki `OMEGA_QUEUE_CONCURRENCY` değeriyle değiştirilebilir. Kuyruk yalnızca uygulama çalışırken bellekte tutulur; işlem geçmişi kaydetmez.

## Kontroller

```powershell
npm run lint
npm test
npm run build
```
