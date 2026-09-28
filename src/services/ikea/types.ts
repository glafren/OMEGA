export type { IkeaProduct, IkeaProductImage } from "@/types";

export interface RawProductData {
  name?: string; code?: string; description?: string;
  details?: Array<{ title: string; content: string }>;
  images: Array<{ url: string; width?: number; height?: number }>;
}
