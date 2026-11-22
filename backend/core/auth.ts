import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { ApiError } from "./errors.js";

// Hash first: timingSafeEqual throws when the lengths differ.
const digest = (value: string) => createHash("sha256").update(value).digest();

export function createToolAuth(secret: string): RequestHandler {
  const expected = digest(secret);
  return (req, _res, next) => {
    const given = req.get("x-tool-secret");
    if (!given || !timingSafeEqual(digest(given), expected)) {
      throw new ApiError("unauthorized", "missing or wrong tool secret");
    }
    next();
  };
}
