interface AuthSessionSource {
  getSession(): Promise<{
    data: { session: unknown | null };
    error: unknown | null;
  }>;
  onAuthStateChange(
    listener: (event: string, session: unknown | null) => void,
  ): { data: { subscription: { unsubscribe(): void } } };
}

export function invitationCallbackError(search: string, hash: string): string | null {
  for (const value of [search, hash]) {
    const parameters = new URLSearchParams(value.replace(/^[?#]/, ''));
    const error = parameters.get('error_description') ?? parameters.get('error_code');
    if (error) return error;
  }
  return null;
}

export function waitForAuthSession(
  auth: AuthSessionSource,
  timeoutMs = 8_000,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => undefined;
    const finish = (hasSession: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(hasSession);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const { data } = auth.onAuthStateChange((_event, session) => {
      if (session) finish(true);
    });
    unsubscribe = () => data.subscription.unsubscribe();

    void auth
      .getSession()
      .then(({ data: sessionData, error }) => finish(!error && Boolean(sessionData.session)))
      .catch(() => finish(false));
  });
}
