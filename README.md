# Build to Real

**Construire en briques en 3D, puis obtenir la notice pas à pas pour le refaire avec de vraies briques.**

👉 **Jouer : https://bertrandformet.github.io/buildtoreal-app/**

Build to Real est un jeu de construction gratuit qui s'ouvre dans le navigateur, sur téléphone, tablette ou ordinateur.
On assemble des briques sur une plaque, en 3D ; le jeu calcule ensuite la notice de montage, étape par étape,
comme celle d'une vraie boîte de construction. On peut alors la feuilleter, l'imprimer, la partager, ou refaire la
construction pour de vrai avec ses propres briques.

Il est pensé pour les enfants de 7 à 12 ans, et reste ouvert à tous.

## Ce qu'on peut faire

- **Construire** sur une plaque de 16, 24 ou 32 tenons de côté, en quatre couleurs de plaque. Un toucher pose la pièce là où
  on vise ; on peut aussi la faire glisser du doigt ou la régler à la croix, puis toucher « Poser ». Des repères verts
  montrent où elle s'accroche, des repères rouges ce qui gêne.
- **Retirer, copier, déplacer** : une pièce se retire d'un toucher. Elle se copie, avec sa forme et sa couleur. Elle se
  soulève avec tout ce qui est posé dessus, et le bouton « Tout l'ensemble » emporte toute une construction, une voiture
  par exemple.
- **Annuler et rétablir** chaque geste, autant de fois que l’on veut pendant la partie.
- **Tourner autour** de la construction, zoomer, recentrer la vue.
- **Obtenir la notice** : elle est calculée depuis la construction finie, puis vérifiée. Reconstruite pas à pas dans un
  modèle vide, elle doit redonner exactement la même construction. Chaque étape montre les nouvelles pièces bien
  visibles, cerclées de noir, et la liste des pièces à prendre.
- **Lire la notice comme un livre** : double page sur grand écran ou en paysage, une page en portrait. La page se courbe
  en tournant, sous le doigt. La notice s'imprime aussi, deux pages par feuille A4 ou une seule, et se télécharge en un
  seul fichier qui fonctionne sans connexion.
- **Garder ses créations** : chaque construction s'enregistre toute seule sur l'appareil, dans « Mes créations ». Elle peut
  aussi être enregistrée dans un fichier, pour la garder à l'abri ou l'ouvrir sur un autre appareil.
- **S'inspirer** de six modèles d'exemple, de la petite voiture à la grande maison sur sept plaques : un château à deux étages,
  un grand pont, un camion. Leurs portes, leurs fenêtres et leurs lumières marchent.
- **Visiter** sa construction en mode Visite, et ouvrir d'un toucher les portes, les fenêtres, les portières, les hayons et
  les portes de garage.
- **Apprendre en jouant** : un guide de quinze petites missions montre les gestes à la première ouverture.

## Les pièces

| Famille | Pièces |
|---|---|
| Briques | 1×1, 1×2, 1×4, 1×6, 1×8, 2×2, 2×3, 2×4, 2×6, 2×8 |
| Cylindres | colonnes rondes de 1 à 4 briques de haut |
| Plaques | 1×1, 1×2, 1×4, 1×6, 1×8, 2×2, 2×4, 2×6, 2×8, 4×4, 6×6, 8×8, plaques rondes 1×1 et 2×2 |
| Tuiles (lisses) | 1×2, 1×4, 1×6, 1×8, 2×2, 2×4, 2×6, 2×8 |
| Pentes | pente raide 1×2 à 2×4, pente douce 2×3 et 2×4, pente d'angle 2×2 |
| Roues | support 2×4 à deux grandes roues, support 2×2 à deux petites roues, support 2×2 à une roue (petite ou grande) |
| Ouvrants | portes, doubles portes, fenêtres, portières de voiture, hayons, portes de garage, en plusieurs tailles |

**16 couleurs**, choisies pour rester distinguables, y compris pour trois formes de daltonisme. Chaque couleur existe en
quatre finitions :

- **opaque** ;
- **transparente** ;
- **givrée** : translucide et dépolie ;
- **lumineuse** : la pièce brille et éclaire autour d'elle. Un **interrupteur** allume et éteint d'un toucher les lumières
  qu'on lui relie avec l'outil **Relier**. L'effet se voit le mieux en **mode nuit**.

Les règles sont celles des vraies briques : une pièce tient si au moins un de ses tenons s'accroche dessous. Rien ne tient
sur une surface lisse, comme une tuile, le haut d'une pente ou un pneu. Et on ne peut pas retirer une pièce qui en porte
une autre. Les roues roulent sur la plaque et passent sous une construction s'il y a la place.

## L'installer comme une application

Le jeu s'installe sur l'écran d'accueil, puis **fonctionne sans connexion** :

- **iPhone, iPad** : ouvrir le lien dans **Safari**, toucher Partager, puis « Sur l'écran d'accueil ».
- **Android** : ouvrir le lien dans **Chrome**, puis menu ⋮ → « Installer l'application » (ou « Ajouter à l'écran d'accueil »).
- **Ordinateur** : dans Chrome ou Edge, l'icône d'installation dans la barre d'adresse.

Le menu ☰ → « Installer l'application » rappelle ces étapes. Quand une nouvelle version est publiée, un bandeau propose
de la charger.

## Réglages

Le menu ☰ propose deux qualités graphiques : **Élevée**, ou **Économie** si le jeu saccade. Des réglages avancés
permettent aussi de choisir l'ambiance (jour ou nuit), le halo des pièces lumineuses, les ombres (douces, simples ou
aucune) et la finesse de l'image.

## Vie privée

Pas de compte, pas de publicité, aucun suivi. Les constructions restent **sur l'appareil**, dans le stockage du
navigateur. Rien n'est envoyé ailleurs, sauf si l'on choisit d'enregistrer ou de partager un fichier.

> Les données locales d'un navigateur peuvent être effacées, par exemple par un nettoyage ou un manque de place.
> Pour une construction à laquelle on tient, mieux vaut l'**enregistrer dans un fichier** (menu ☰).

## À propos de ce dépôt

Ce dépôt contient seulement la **version compilée** du jeu, servie par GitHub Pages. Il est mis à jour automatiquement à
chaque nouvelle version et ne se modifie pas à la main. Le code source est tenu à part.

Le jeu est écrit en TypeScript et utilise three.js pour la 3D. C'est un site statique, sans serveur : tout se passe dans
le navigateur.

## Licence

© 2026 Bertrand Formet. Publié sous licence
[Creative Commons Attribution - Pas d'utilisation commerciale 4.0 International (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/deed.fr) :
partage et adaptation autorisés en citant l'auteur, sans usage commercial. Le texte complet est dans `LICENSE`.

La police Baloo 2 reste sous sa propre licence (SIL Open Font License, `OFL-Baloo2.txt`).

Build to Real est un projet indépendant, sans lien avec aucun fabricant de jouets de construction.
