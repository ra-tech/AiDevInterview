export class AIProviderError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AIProviderError';
    this.cause = cause;
  }
}
