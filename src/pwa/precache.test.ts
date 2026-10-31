import { describe, expect, it } from 'vitest';
import { LIST_MARKER, VERSION_MARKER, precacheList, precacheVersion, stampServiceWorker } from '../../scripts/precache';

describe('préchargement du hors ligne', () => {
  it('liste la racine puis chaque fichier publié, sans cartes, sans service worker, sans fichiers cachés', () => {
    const list = precacheList(['index.html', 'sw.js', 'assets/index-AbC.js', 'assets/index-AbC.js.map', 'assets/font.woff2', '.DS_Store', 'icon-192.png', 'manifest.webmanifest']);
    expect(list).toEqual(['./', './assets/font.woff2', './assets/index-AbC.js', './icon-192.png', './index.html', './manifest.webmanifest']);
  });

  it('accepte les chemins de Windows et ne répète rien', () => {
    expect(precacheList(['assets\\a.js', 'assets/a.js', 'index.html'])).toEqual(['./', './assets/a.js', './index.html']);
  });

  it('la version ne dépend pas de l’ordre, et change dès qu’un contenu change', () => {
    const a = precacheVersion([
      { path: './a.js', hash: '1' },
      { path: './b.js', hash: '2' },
    ]);
    const reversed = precacheVersion([
      { path: './b.js', hash: '2' },
      { path: './a.js', hash: '1' },
    ]);
    const changed = precacheVersion([
      { path: './a.js', hash: '1' },
      { path: './b.js', hash: '3' },
    ]);
    expect(a).toBe(reversed);
    expect(a).not.toBe(changed);
    expect(a).toMatch(/^[0-9a-f]{10}$/);
  });

  it('inscrit la liste et la version dans le service worker, et refuse un service worker sans repères', () => {
    const source = `const CACHE = 'bt-${VERSION_MARKER}';\nconst PRECACHE = ${LIST_MARKER};\n`;
    const out = stampServiceWorker(source, ['./', './a.js'], 'abc123');
    expect(out).toContain("'bt-abc123'");
    expect(out).toContain('"./a.js"');
    expect(out).not.toContain(VERSION_MARKER);
    expect(out).not.toContain(LIST_MARKER);
    expect(() => stampServiceWorker('rien', [], 'x')).toThrow();
  });

  it('le service worker publié contient bien les deux repères', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('public/sw.js', 'utf8');
    expect(source).toContain(LIST_MARKER);
    expect(source).toContain(VERSION_MARKER);
  });
});
