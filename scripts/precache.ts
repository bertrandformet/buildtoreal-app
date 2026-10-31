// Préchargement du jeu pour le hors ligne : à la fin d'une construction (`vite build`), la liste de tous les fichiers publiés
// et un numéro de version tiré de leur contenu sont écrits dans `dist/sw.js`. Une nouvelle version du jeu donne donc un nouveau
// service worker, que le navigateur détecte tout seul.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';

export const LIST_MARKER = '/*__PRECACHE__*/[]';
export const VERSION_MARKER = '__VERSION__';

/** Fichiers qui ne se préchargent pas : cartes de débogage, le service worker lui-même, fichiers cachés du système. */
function skipped(path: string): boolean {
  return path.endsWith('.map') || path === 'sw.js' || path.split('/').some((part) => part.startsWith('.'));
}

/** Liste à précharger : la racine, puis chaque fichier en chemin relatif (« ./assets/… »), dans l'ordre alphabétique. */
export function precacheList(files: readonly string[]): string[] {
  const kept = files.map((f) => f.replace(/\\/g, '/')).filter((f) => !skipped(f));
  return ['./', ...[...new Set(kept)].sort().map((f) => `./${f}`)];
}

/** Numéro de version : empreinte de la liste et du contenu de chaque fichier (10 caractères). */
export function precacheVersion(entries: ReadonlyArray<{ readonly path: string; readonly hash: string }>): string {
  const h = createHash('sha1');
  for (const e of [...entries].sort((a, b) => a.path.localeCompare(b.path))) h.update(`${e.path}:${e.hash}\n`);
  return h.digest('hex').slice(0, 10);
}

/** Écrit la liste et la version dans le texte du service worker. Refuse un service worker sans les deux repères. */
export function stampServiceWorker(source: string, list: readonly string[], version: string): string {
  if (!source.includes(LIST_MARKER) || !source.includes(VERSION_MARKER)) throw new Error('sw.js : repères de préchargement introuvables');
  return source.replace(LIST_MARKER, JSON.stringify(list, null, 2)).split(VERSION_MARKER).join(version);
}

function walk(dir: string, root: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, root, out);
    else out.push(relative(root, full));
  }
  return out;
}

export function precachePlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'precache-sw',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const swPath = join(outDir, 'sw.js');
      if (!existsSync(swPath)) return;
      const files = walk(outDir, outDir);
      const list = precacheList(files);
      const entries = list
        .filter((p) => p !== './')
        .map((p) => ({ path: p, hash: createHash('sha1').update(readFileSync(join(outDir, p))).digest('hex') }));
      writeFileSync(swPath, stampServiceWorker(readFileSync(swPath, 'utf8'), list, precacheVersion(entries)));
    },
  };
}
