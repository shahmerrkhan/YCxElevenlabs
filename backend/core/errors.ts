import type { ErrorRequestHandler, RequestHandler } from "express";

const HTTP_STATUS = {
  invalid_request: 400,
  unauthorized: 401,
  not_found: 404,
  invalid_status: 409,
  no_transcripts: 422,
  internal_error: 500,
} as const;

export class ApiError extends Error {
  constructor(readonly code: keyof typeof HTTP_STATUS, message: string) {
    super(message);
  }
}

export const notFound: RequestHandler = () => {
  throw new ApiError("not_found", "no such route");
};

export const handleError: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);

  let apiError: ApiError;
  if (err instanceof ApiError) {
    apiError = err;
  } else if (err?.status >= 400 && err?.status < 500) {
    // Raised by Express itself: bad JSON, body too large, malformed URL.
    apiError = new ApiError("invalid_request", "invalid request");
  } else {
    console.error(err);
    apiError = new ApiError("internal_error", "something went wrong");
  }

  const { code, message } = apiError;
  res.status(HTTP_STATUS[code]).json({ error: { code, message } });
};
