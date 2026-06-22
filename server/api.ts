import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import { AdminAuthorizationError } from './auth/authorize.js';

export class ApiConflictError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ApiConflictError';
  }
}

export function sendJson(response: VercelResponse, status: number, body: unknown) {
  response.status(status).json(body);
}

export function methodNotAllowed(response: VercelResponse, allowed: string[]) {
  response.setHeader('Allow', allowed.join(', '));
  sendJson(response, 405, { error: 'method_not_allowed' });
}

export function handleApiError(error: unknown, response: VercelResponse) {
  if (error instanceof AdminAuthorizationError) {
    const status = error.code === 'forbidden' ? 403 : 401;
    sendJson(response, status, { error: error.code, message: error.message });
    return;
  }
  if (error instanceof ZodError) {
    sendJson(response, 400, {
      error: 'invalid_request',
      message: 'The request data is invalid.',
      issues: error.issues,
    });
    return;
  }
  if (error instanceof ApiConflictError) {
    sendJson(response, 409, { error: error.code, message: error.message });
    return;
  }

  console.error(error);
  sendJson(response, 500, { error: 'internal_error', message: 'The server could not complete the request.' });
}

export function requestBody(request: VercelRequest): unknown {
  if (typeof request.body === 'string') {
    return JSON.parse(request.body) as unknown;
  }
  return request.body;
}
