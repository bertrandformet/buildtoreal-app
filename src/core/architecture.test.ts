// Frontière d'architecture : le cœur (modèle, règles, historique) ne dépend ni du rendu, ni de l'interface, ni du navigateur.
// C'est ce qui permettra, plus tard, une seconde interface sans dupliquer les règles.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const coreDir = join(import.meta.dirname, '.');

describe('frontières de modules', () => {
  const files = readdirSync(coreDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  for (const file of files) {
    it(`${file} n'importe ni rendu, ni interface, ni three, ni DOM`, () => {
      const source = readFileSync(join(coreDir, file), 'utf8');
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
      for (const spec of imports) {
        expect(spec.startsWith('./'), `${file} importe « ${spec} »`).toBe(true);
      }
      expect(source).not.toMatch(/\b(document|window|navigator|localStorage)\b/);
    });
  }
});
