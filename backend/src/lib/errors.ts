export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, code = 'BAD_REQUEST', d?: unknown) => new AppError(400, m, code, d);
export const unauthorized = (m = 'Authentification requise.') => new AppError(401, m, 'UNAUTHORIZED');
export const forbidden = (m = "Vous n'avez pas le droit d'effectuer cette action.") => new AppError(403, m, 'FORBIDDEN');
export const notFound = (m = 'Ressource introuvable.') => new AppError(404, m, 'NOT_FOUND');
export const conflict = (m: string, code = 'CONFLICT') => new AppError(409, m, code);
