export class GitOutputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'GitOutputError';
  }
}
