export type { IkeaProduct, IkeaProductImage } from "@/types";

export interface RawProductData {
  name?: string; code?: string; images: Array<{ url: string; width?: number; height?: number }>;
}
