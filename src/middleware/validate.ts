import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';

interface ValidateSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validate + whitelist request input against Zod schemas.
 * On success, `req.body` / `req.params` are replaced with the parsed (coerced, stripped)
 * values — closing the mass-assignment hole of inserting raw `req.body`.
 *
 * Note: list-query parsing is handled by utils/query.ts (req.query is read-only in some
 * Express versions), so this middleware intentionally covers body + params only.
 */
export const validate =
  (schemas: ValidateSchemas) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) {
        const parsed = schemas.params.parse(req.params);
        Object.assign(req.params, parsed);
      }
      return next();
    } catch (err) {
      return next(err); // ZodError → handled by global errorHandler (400)
    }
  };
