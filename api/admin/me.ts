import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleApiError, methodNotAllowed, sendJson } from '../../server/api.js';
import { requireRequestAdmin } from '../../server/auth/request.js';

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') {
    methodNotAllowed(response, ['GET']);
    return;
  }
  try {
    const admin = await requireRequestAdmin(request);
    sendJson(response, 200, {
      membership: admin.membership,
      grantExpiresAt: admin.grantExpiresAt,
    });
  } catch (error) {
    handleApiError(error, response);
  }
}
