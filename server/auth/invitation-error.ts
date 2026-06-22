type UpstreamError = {
  status?: unknown;
  message?: unknown;
};

export function invitationErrorResponse(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;

  const upstream = error as UpstreamError;
  const message = typeof upstream.message === 'string' ? upstream.message.toLowerCase() : '';
  if (upstream.status !== 429 && !message.includes('email rate limit')) return undefined;

  return {
    status: 429,
    body: {
      error: 'invitation_rate_limited',
      message: 'Too many invitation emails were requested. Wait a while and try again.',
    },
  } as const;
}
