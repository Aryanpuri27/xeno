import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { logger } from "./logger";

// ── Error hierarchy ───────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, "NOT_FOUND", 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

// 422 — business logic failure (e.g. segment returned 0 customers)
export class BusinessError extends AppError {
  constructor(message: string, code: string) {
    super(message, code, 422);
  }
}

export class OrchestratorError extends AppError {
  constructor(message: string) {
    super(message, "ORCHESTRATOR_ERROR", 500);
  }
}

export class AgentError extends AppError {
  constructor(message: string) {
    super(message, "AGENT_ERROR", 500);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, "UNAUTHORIZED", 401);
  }
}

// ── Centralized route handler ─────────────────────────────────────────────────

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues[0]?.message ?? "Invalid input",
          issues: error.issues,
        },
      },
      { status: 400 }
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.statusCode }
    );
  }

  // Unknown error — log full error but never expose internals to client
  logger.error({ error }, "Unhandled error in route handler");
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
    { status: 500 }
  );
}
