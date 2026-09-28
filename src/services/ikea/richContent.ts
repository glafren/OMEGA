import type { IkeaProduct } from "@/types";
import type { RichContentCopy } from "@/services/openai/richContentCopy";

type TemplateKind = "gallery" | "chess" | "compact";
type JsonObject = Record<string, unknown>;
const IKEA_ROLL_IMAGE = "https://ir-20.ozone.ru/s3/multimedia-1-d/ww1200/14789671717.jpg";

const title = (content: string, size = "size4") => ({ items: [{ type: "text", content }], size, align: "left", color: "color1" });
const text = (content: string) => ({ size: "size2", align: "left", color: "color1", items: [{ type: "text", content }] });
const image = (src: string, widthMobile: number, heightMobile: number, position = "fill") => ({
  src, srcMobile: src, alt: "", position, positionMobile: position, widthMobile, heightMobile,
});

const featureBlock = (src: string, benefit: RichContentCopy["benefits"][number], reverse?: boolean, edge = false) => ({
  img: image(src, 750, 1000, edge ? "to_the_edge" : "fill"),
  imgLink: "",
  title: title(benefit.title),
  text: text(benefit.description),
  ...(reverse === undefined ? {} : { reverse }),
});

function technicalItems(product: IkeaProduct, copy: RichContentCopy) {
  const values = [
    `Бренд: IKEA`,
    `Серия: ${product.modelName}`,
    `Артикул: ${product.productCode}`,
    `Наименование: ${copy.headline}`,
    ...copy.specifications.map((item) => `${item.label}: ${item.value}`),
  ];
  return values.flatMap((content, index) => index === values.length - 1
    ? [{ type: "text", content }]
    : [{ type: "text", content }, { type: "br" }, { type: "br" }]);
}

function technicalBlock(product: IkeaProduct, copy: RichContentCopy, src: string) {
  return {
    img: image(src, 2000, 2000), imgLink: "",
    title: title("Технические характеристики"),
    text: { size: "size2", align: "left", color: "color1", items: technicalItems(product, copy) },
    reverse: false,
  };
}

function roll() {
  return { widgetName: "raShowcase", type: "roll", blocks: [{ imgLink: "", img: image(IKEA_ROLL_IMAGE, 830, 620, "width_full") }] };
}

function benefitList(benefits: RichContentCopy["benefits"]) {
  return {
    widgetName: "list", theme: "bullet",
    blocks: benefits.map((benefit) => ({ title: title(benefit.title), text: text(benefit.description) })),
  };
}

function textBlock(benefit: RichContentCopy["benefits"][number]) {
  return {
    widgetName: "raTextBlock", title: title(benefit.title, "size5"), theme: "primary",
    padding: "type2", gapSize: "m", text: text(benefit.description),
  };
}

export function selectIkeaRichContentTemplate(imageCount: number): TemplateKind {
  if (imageCount >= 6) return "gallery";
  if (imageCount >= 4) return "chess";
  return "compact";
}

export function createIkeaRichContent(product: IkeaProduct, copy: RichContentCopy) {
  const urls = product.images.map((item) => item.url);
  if (!urls.length) throw new Error("Rich Content için görsel bulunamadı.");
  const kind = selectIkeaRichContentTemplate(urls.length);
  const content: JsonObject[] = [roll()];

  if (kind === "gallery") {
    const featureImages = urls.slice(1, 7);
    content.push({ widgetName: "raShowcase", type: "chess", blocks: [technicalBlock(product, copy, urls[0])] });
    content.push({
      widgetName: "raShowcase", type: "tileL",
      blocks: featureImages.map((src, index) => featureBlock(src, copy.benefits[index % copy.benefits.length], undefined, index === featureImages.length - 1)),
    });
  } else if (kind === "chess") {
    const featureImages = urls.slice(1);
    content.push({
      widgetName: "raShowcase", type: "chess",
      blocks: [technicalBlock(product, copy, urls[0]), ...featureImages.map((src, index) => featureBlock(src, copy.benefits[index], index % 2 === 0))],
    });
    const unused = copy.benefits.slice(featureImages.length);
    if (unused.length) content.push(benefitList(unused));
  } else {
    const featureImages = urls.slice(1);
    const chessBlocks: JsonObject[] = [technicalBlock(product, copy, urls[0])];
    chessBlocks.push(...featureImages.map((src, index) => featureBlock(src, copy.benefits[index], index % 2 === 0)));
    content.push({ widgetName: "raShowcase", type: "chess", blocks: chessBlocks });
    const usedBenefits = featureImages.length;
    const listBenefits = copy.benefits.slice(usedBenefits, usedBenefits + 3);
    if (listBenefits.length) content.push(benefitList(listBenefits));
    const emphasized = copy.benefits[usedBenefits + listBenefits.length];
    if (emphasized) content.push(textBlock(emphasized));
  }

  return { content, version: 0.3 };
}

export function countRichContentBlocks(value: ReturnType<typeof createIkeaRichContent>) {
  return value.content.reduce((total, widget) => total + (Array.isArray(widget.blocks) ? widget.blocks.length : 1), 0);
}
