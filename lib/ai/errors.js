// lib/ai/errors.js
//
// Typed errors for the AI generation layer. Callers use these to distinguish
// retryable failures (transient API errors, malformed responses) from terminal
// outcomes that should NOT be retried (e.g., the model returned a valid response
// but the input genuinely had no distinct material).

export class NoDistinctMaterialError extends Error {
  constructor(message = 'Not enough distinct material to generate questions') {
    super(message);
    this.name = 'NoDistinctMaterialError';
  }
}
