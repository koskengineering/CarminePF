import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err instanceof AppError) {
    logger.error(`AppError: ${err.message}`, { statusCode: err.statusCode, stack: err.stack });
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        status: err.statusCode
      }
    });
  } else {
    logger.error(`Unexpected error: ${err.message}`, err);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        status: 500
      }
    });
  }
};