import { AppError } from "@/lib/errors";
import type { PhilipsFeature } from "@/types";

type Translator = (text: string) => Promise<string>;

const sampleTranslations = new Map<string, string>([
  ["Tüm bakım ihtiyaçlarınız için 9 başlık", "9 насадок для всех ваших потребностей по уходу"],
  ["Erkek bakım setimiz, sakalınızı kısaltmanız ve şekillendirmeniz, saçınızı kısaltmanız ve vücut bakımınızı yapmanız için 9 farklı başlıkla birlikte gelir; böylece kişisel bakım ihtiyaçlarınızın tümünü kolayca karşılar.", "Наш мужской набор для ухода поставляется с 9 различными насадками для подравнивания и стайлинга бороды, стрижки волос и ухода за телом, легко удовлетворяя все ваши персональные потребности."],
  ["İdeal sakalınıza zahmetsiz ve net bir kesim ile ulaşın", "Легко и точно создавайте идеальную форму бороды"],
  ["Düzelticinin bıçakları ve sakal tarakları, istediğiniz görünüme kolayca ulaşmanızı sağlayan temiz ve düzgün hatlar oluşturur.", "Лезвия триммера и гребни для бороды создают чистые и ровные линии, позволяя с легкостью добиться желаемого внешнего вида."],
  ["Saçınızı dilediğiniz gibi kesin", "Стригите волосы так, как вам нравится"],
  ["Saç kesme tarağını takın ve farklı uzunluk ayarlarından birini seçerek saç stilinizi evde kolayca koruyun.", "Установите гребень для стрижки волос и выберите одну из настроек длины, чтобы легко поддерживать прическу в домашних условиях."],
  ["Vücut tıraşınızı rahat ve güvenli bir şekilde yapın", "Комфортное и безопасное бритье тела"],
  ["Düzelticinin takılıp çıkarılabilir vücut tarağı, konforlu ve etkili bir tıraş sağlar; böylece vücudunuzu rahat ve güvenle tıraş edebilirsiniz.", "Съемный гребень для тела обеспечивает комфортное и эффективное бритье, позволяя ухаживать за телом легко и с полной уверенностью."],
  ["Burun ve kulak çevresindeki istemeyen tüyleri kontrol altına alın", "Контролируйте нежелательные волоски в носу и ушах"],
  ["Erkek bakım seti, burun ve kulak çevresindeki istenmeyen tüyleri kesik veya tahrişe neden olmadan kolayca temizlemeniz için tasarlanmıştır.", "Набор для ухода разработан для легкого удаления нежелательных волосков в носу и ушах без порезов и раздражений."],
  ["Net kesim ve uzun ömürlü performans", "Точный срез и долговечная работа"],
  ["Kendi kendini bileyen çelik bıçaklar, ekstra dayanıklı yapısıyla her kesimde net ve kontrollü sonuçlar sunar. İlk günkü keskinliğini uzun süre korur, üstelik yağlama gerektirmez. Paslanmaz yapısı sayesinde temizliği de son derece kolaydır.", "Самозатачивающиеся стальные лезвия повышенной прочности обеспечивают точный и контролируемый результат при каждом срезе. Они сохраняют первоначальную остроту на долгое время и не требуют смазки. Благодаря нержавеющим свойствам их чрезвычайно легко чистить."],
  ["Farklı uzunluk seçenekleri ile dilediğiniz görünüme ulaşın", "Добивайтесь желаемого образа с различными вариантами длины"],
  ["Dilediğiniz görünüme ulaşmak için 3 ile 7 mm arasında size en uygun uzunluğu seçin.", "Выберите наиболее подходящую длину от 3 до 7 мм для создания желаемого стиля."],
  ["Daha konforlu bir kişisel bakım deneyimi için tasarlandı", "Разработан для более комфортного персонального ухода"],
  ["Yuvarlatılmış uçlara sahip özel bıçak teknolojisi, cildi tahriş etmez. Daha konforlu bir kişisel bakım deneyimi sunar.", "Специальная технология лезвий с закругленными кончиками не раздражает кожу, обеспечивая более комфортный процесс ухода."],
  ["Hassas bölgelerde konforlu tıraş için özel olarak tasarlanmıştır", "Специально разработан для комфортного бритья чувствительных зон"],
  ["Hepsi Bir Arada Erkek Bakım Setinin hassas bölge tarağı, hassas bölgelerinizi doğrudan bıçak temasına karşı koruyacak şekilde özel olarak tasarlanmıştır; ekstra konfor sunar.", "Гребень для чувствительных зон в универсальном наборе специально разработан для защиты деликатных участков от прямого контакта с лезвием, обеспечивая дополнительный комфорт."],
  ["Düzeltme sırasında daha fazla kontrol ve konfor için", "Больше контроля и комфорта во время подравнивания"],
  ["Ergonomik tasarımı sayesinde cihazı rahatça kavrayabilir ve kolayca yönlendirebilirsiniz. Görünümünüzü kusursuzlaştırmanız için gereken konfor ve kontrolü sağlar.", "Благодаря эргономичному дизайну вы можете удобно удерживать и легко направлять устройство. Это обеспечивает контроль и комфорт, необходимые для доведения вашего образа до совершенства."],
  ["Baştan sona tutarlı ve güçlü performans", "Стабильная и мощная работа от начала до конца"],
  ["Dayanıklı lityum pilimiz, kesintisiz ve güçlü bir tıraş deneyimi için 90 dakikaya kadar kullanım süresi sunar.", "Наш надежный литиевый аккумулятор обеспечивает до 90 минут автономной работы для непрерывного и мощного бритья."],
  ["Her tıraşta kontrolü ele alın", "Держите всё под контролем при каждом бритье"],
  ["Işık göstergesi, pil durumunuzu (düşük, boş ya da şarj oluyor) tam olarak bildirir, böylece bir sonraki kişisel bakım rutininize her zaman hazır olmanızı sağlar.", "Световой индикатор точно информирует о состоянии аккумулятора (низкий заряд, разряжен или заряжается), гарантируя готовность к следующей процедуре ухода."],
  ["Kolay temizlenen başlıklar", "Легко моющиеся насадки"],
  ["Makinenizin başlığını çıkarın, hızlı ve kolay temizlik için musluk altında durulayın. Ardından, başlığı sapına takmadan önce iyice kuruladığınızdan emin olun.", "Снимите насадку с устройства и промойте ее под струей воды из-под крана для быстрой и простой очистки. Перед тем как установить насадку обратно на рукоятку, убедитесь, что она полностью высохла."],
]);

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export async function translateToRussian(text: string): Promise<string> {
  const normalized = normalizeText(text);
  const known = sampleTranslations.get(normalized);
  if (known) return known;
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", normalized);
  url.searchParams.set("langpair", "tr|ru");
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "OMEGA/1.0" }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Çeviri servisi HTTP ${response.status}`);
    const body = await response.json() as { responseData?: { translatedText?: string } };
    const translated = normalizeText(body.responseData?.translatedText || "");
    if (!translated || !/[\u0400-\u04ff]/u.test(translated)) throw new Error("Geçersiz çeviri yanıtı");
    return translated;
  } catch (error) {
    throw new AppError("Rich Content için Rusça çeviri oluşturulamadı.", "TRANSLATION_FAILED", { cause: error });
  }
}

export async function createPhilipsRichContent(features: PhilipsFeature[], translator: Translator = translateToRussian) {
  if (!features.length) throw new AppError("Philips özellik kartları bulunamadı.", "RICH_CONTENT_MISSING");
  const blocks = [];
  for (const feature of features) {
    const [title, text] = await Promise.all([translator(feature.title), translator(feature.text)]);
    blocks.push({
      img: { src: feature.imageUrl, srcMobile: feature.imageUrl, alt: "", position: "to_the_edge", positionMobile: "to_the_edge", widthMobile: 400, heightMobile: 225 },
      imgLink: "",
      title: { items: [{ type: "text", content: title }], size: "size4", align: "left", color: "color1" },
      text: { size: "size2", align: "left", color: "color1", items: [{ type: "text", content: text }] },
    });
  }
  return { content: [{ widgetName: "raShowcase", type: "tileL", blocks }], version: 0.3 };
}
