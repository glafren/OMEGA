export type JobStage =
  | "VALIDATING_INPUT" | "RESOLVING_PRODUCT" | "OPENING_IKEA_PAGE"
  | "EXTRACTING_PRODUCT_DATA" | "EXTRACTING_IMAGES" | "DOWNLOADING_IMAGES"
  | "PROCESSING_COVER" | "PROCESSING_GALLERY" | "CREATING_VIDEO" | "CREATING_ZIP" | "COMPLETED" | "ERROR";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface IkeaProductImage { url: string; width?: number; height?: number; order: number }
export interface IkeaProduct {
  productCode: string; modelName: string; fullName?: string; sourceUrl: string;
  images: IkeaProductImage[];
}
export interface OutputImage { id: string; filename: string; width: 750; height: 1000; isCover: boolean }
export interface OutputVideo { filename: string; width: 750; height: 1000; durationSeconds: number }
export interface JobEvent { jobId: string; stage: JobStage; message: string; progress: number; timestamp: string }
export interface JobRecord {
  jobId: string; input: string; status: JobStatus; stage: JobStage; progress: number;
  message: string; createdAt: string; updatedAt: string; product?: IkeaProduct;
  outputs: OutputImage[]; video?: OutputVideo; error?: string;
}
