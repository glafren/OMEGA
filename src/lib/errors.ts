export class AppError extends Error {
  constructor(public userMessage: string, public code: string, options?: ErrorOptions) {
    super(userMessage, options); this.name = "AppError";
  }
}

export const friendlyError = (error: unknown) =>
  error instanceof AppError ? error.userMessage : "İşlem sırasında beklenmeyen bir hata oluştu.";
