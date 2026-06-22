export function extractBearerToken(authorization: string | undefined): string {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    throw new Error('A Bearer authorization token is required.');
  }
  return match[1];
}

export function readSessionId(verifiedJwt: string): string {
  try {
    const parts = verifiedJwt.split('.');
    if (parts.length !== 3) {
      throw new Error('Malformed token.');
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      session_id?: unknown;
    };
    if (typeof payload.session_id !== 'string' || payload.session_id.length === 0) {
      throw new Error('Missing session claim.');
    }
    return payload.session_id;
  } catch {
    throw new Error('The authenticated token has no valid Supabase session_id.');
  }
}
