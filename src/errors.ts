export class NuxieError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NuxieError';
  }
}
export function asError(error: unknown): NuxieError {
  if (error instanceof NuxieError) return error;
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'nativeError';
  return new NuxieError(code, error instanceof Error ? error.message : 'Nuxie operation failed', { cause: error });
}
