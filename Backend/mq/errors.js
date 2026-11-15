// Throw from a handler when retrying cannot possibly help (unknown meter,
// malformed data...). The consumer moves the message straight to <queue>.dlq.
export class PermanentError extends Error {
  constructor(message) {
    super(message);
    this.name = "PermanentError";
    this.permanent = true;
  }
}
