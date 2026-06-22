import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(filePath);
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return [];
      return [filePath];
    }),
  );
  return files.flat();
}

describe('Vercel Node ESM imports', () => {
  it('uses emitted .js extensions for every runtime-relative import', async () => {
    const files = [
      ...(await sourceFiles(path.resolve('api'))),
      ...(await sourceFiles(path.resolve('server'))),
    ];
    const invalidImports: string[] = [];

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        if (!/\.(?:js|json)$/.test(match[1])) {
          invalidImports.push(`${path.relative(process.cwd(), file)}: ${match[1]}`);
        }
      }
    }

    expect(invalidImports).toEqual([]);
  });
});
