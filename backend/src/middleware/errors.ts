import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Resource not found."
    }
  });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  console.error("Unhandled request error", summarizeError(error));
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Unexpected server error."
    }
  });
}

function summarizeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { type: typeof error };
  }

  const maybeCode = "code" in error ? (error as { code?: unknown }).code : undefined;
  return {
    name: error.name,
    code: maybeCode
  };
}
