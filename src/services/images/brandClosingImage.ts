import type { ProductBrand } from "@/types";

export function brandClosingImageFilename(brand: ProductBrand) {
  return brand === "ikea" ? "ikea-son.png" : "philips-son.png";
}
