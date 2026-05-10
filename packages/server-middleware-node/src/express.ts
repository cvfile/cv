import type { NextFunction, Request, Response } from 'express';
import { cvHandler, type CvHandlerOptions } from './handler.js';

export function cvMiddleware(options: CvHandlerOptions) {
  const handler = cvHandler(options);
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.path.toLowerCase().endsWith('.cv')) {
      next();
      return;
    }
    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    }
  };
}
