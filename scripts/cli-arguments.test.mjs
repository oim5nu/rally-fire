import { describe, expect, it } from 'vitest';
import { resolveRedirectArgument } from './cli-arguments.mjs';

describe('initial invitation CLI arguments', () => {
  it('ignores pnpm argument separators before the redirect URL', () => {
    expect(
      resolveRedirectArgument(['--', 'https://rally-fire.vercel.app/?setup=1']),
    ).toBe('https://rally-fire.vercel.app/?setup=1');
  });

  it('also accepts a URL without an argument separator', () => {
    expect(resolveRedirectArgument(['https://example.com/?setup=1'])).toBe(
      'https://example.com/?setup=1',
    );
  });
});
