# Build to Real

**Un jeu de construction en briques 3D, dans le navigateur, qui écrit la notice de montage pour refaire sa construction avec de vraies briques.**

👉 **Jouer : https://bertrandformet.github.io/buildtoreal-app/**

On assemble des briques sur une plaque, en 3D, sur téléphone, tablette ou ordinateur. Le jeu calcule ensuite la notice, étape par étape, comme celle d'une vraie boîte : on la feuillette comme un livre, on l'imprime, on la télécharge, ou on refait la construction pour de vrai. Gratuit, sans compte, sans publicité, sans suivi : tout se passe dans le navigateur et les constructions restent sur l'appareil.

## Ce que fait le jeu

- **Construire** avec des briques, plaques, tuiles, pentes, cylindres et roues, en 16 couleurs et quatre finitions (opaque, transparente, givrée, lumineuse). Les règles sont celles des vraies briques : une pièce tient si un de ses tenons s'accroche dessous.
- **Retirer, copier, déplacer** une pièce ou toute une construction, annuler et rétablir.
- **Des ouvrants** : portes, doubles portes, fenêtres, portières, hayons et portes de garage s'ouvrent d'un toucher.
- **Des lumières** : des pièces lumineuses, des interrupteurs, et un outil **Relier** pour choisir ce que commande chaque interrupteur.
- **Visiter** sa construction en mode Visite et en faire le tour, de jour ou de nuit.
- **Plusieurs plaques** : la surface s'agrandit jusqu'à 128 × 128 tenons.
- **La notice** est calculée depuis la construction finie, puis **vérifiée** : rejouée dans un modèle vide, elle doit redonner exactement la même construction. Elle se lit comme un livre à pages qui se tournent, s'imprime et se télécharge en un fichier autonome.
- **Six modèles d'exemple**, de la voiture au château, au pont et à la grande maison, avec leurs portes, fenêtres et lumières déjà réglées.
- **Hors ligne** : le jeu s'installe sur l'écran d'accueil et fonctionne sans connexion. Les créations s'enregistrent toutes seules (IndexedDB) et peuvent aussi l'être dans un fichier `.briques.json`.
- Un **guide** de quinze petites missions montre les gestes à la première ouverture.

## Lancer le projet

Il faut Node.js (une version récente).

```bash
npm install
npm run dev        # serveur de développement, accessible sur le réseau local (pour essayer sur un téléphone)
npm test           # près de 400 tests
npm run build      # site statique dans dist/
```

Ajouter `?debug=1` à l'adresse affiche un panneau de mesures (images par seconde, poses ratées) ; `?q=low` désactive les ombres pour les appareils modestes.

## Organisation du code

- `src/core` : le modèle, les règles de pose, l'historique, la notice, les lumières, les ouvrants et les modèles d'exemple. **Aucun import de rendu, d'interface ou de navigateur** : un test le vérifie.
- `src/render` : la scène three.js (pièces, fantôme, caméra, ombres, halos) et le rendu des images de la notice.
- `src/ui` : l'interface et les gestes (outils, tiroir de pièces, guide, galerie, installation).
- `src/export` : la notice en fichier HTML autonome, le livre à pages, les vignettes de pièces.
- `src/storage` : l'enregistrement local et le verrou d'onglet.
- `src/pwa` : le service worker et l'installation hors ligne.
- `src/i18n/fr.ts` : tous les textes de l'interface (une autre langue serait un autre fichier).
- `scripts/precache.ts` : écrit la liste des fichiers du service worker à la construction.

Les tests (`*.test.ts`, à côté du code) couvrent les règles de pose, l'historique, la notice rejouée, les lumières et les ouvrants, les modèles d'exemple, la palette (écarts de teintes, y compris pour trois formes de daltonisme) et l'enregistrement.

## Technique

TypeScript, Vite et three.js ; aucun serveur, aucune dépendance au démarrage. La notice se vérifie en la rejouant, ce qui garantit qu'elle redonne la construction. Les fichiers de projet (`.briques.json`) et la notice sont validés à la lecture : un fichier incohérent est refusé avec sa raison.

## Le site publié

Cette branche contient le code source. Le site compilé est servi par GitHub Pages depuis la branche `gh-pages`.

## Licence

© 2026 Bertrand Formet. Ce projet est publié sous licence [Creative Commons Attribution - Pas d'utilisation commerciale 4.0 International (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/deed.fr) : partage et modification autorisés en citant l'auteur, sans usage commercial. Texte complet : [LICENSE](LICENSE). La police Baloo 2 reste sous sa propre licence (SIL OFL, `public/OFL-Baloo2.txt`).
