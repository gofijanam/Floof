export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code }
}
export function requireThat(ok, code, message, status=400) { if (!ok) throw new AppError(status, code, message) }
