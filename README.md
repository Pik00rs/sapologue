# Ma Garde-robe — app IA multi-utilisateurs

Application de garde-robe personnelle, déployable pour plusieurs personnes.
Chacun crée son profil, définit **sa** palette et **sa** prompt de style, puis
nourrit sa propre garde-robe. Claude compose et corrige les tenues selon le
style de chaque utilisateur.

PWA installable + hors-ligne. Hébergée sur **Vercel** (app + API ensemble).

---

## Prise en main (côté utilisateur)

1. **Premier lancement** → création du profil (prénom).
2. Onglet **Palette** → définir ses familles de couleurs (ou « Charger l'exemple »).
3. Onglet **Prompt** → décrire son esthétique et ses règles (ou « Charger l'exemple »).
4. Onglet **Pièces** (+) → ajouter ses vêtements par photo. Claude détecte
   couleur, type, matière et famille.
5. Onglet **Tenues** → **« Générer mes tenues »**. Claude compose selon la
   palette et la prompt de l'utilisateur.
6. **Miroir** → photographier une tenue portée pour la faire corriger.

Tout est **stocké sur l'appareil** de chacun (localStorage + IndexedDB pour les
photos). Rien n'est partagé entre utilisateurs. Export / import JSON dans le Journal.

---

## Déploiement (une fois, par l'admin)

### Structure
```
index.html · sw.js · manifest.json · version.json
vercel.json · package.json · icon-*.png
api/claude.js
```

### Étapes
1. Pousser ces fichiers sur un repo GitHub (avec le dossier `api/`).
2. [vercel.com](https://vercel.com) → **Add New… → Project** → importer le repo →
   Framework **Other** → **Deploy**.
3. **Settings → Environment Variables** : ajouter `ANTHROPIC_API_KEY` = ta clé
   `sk-ant-…`, cocher les 3 environnements → **Save**.
4. **Redéployer** (Deployments → ⋯ → Redeploy).

> ⚠️ **Une seule clé API pour toute l'app.** Tous les utilisateurs passent par
> `/api/claude`, qui utilise ta clé côté serveur. La consommation de tous les
> utilisateurs est donc sur **ton** compte Anthropic. Pour un usage familial /
> proches c'est parfait. Pour un usage public, prévois un quota ou une auth.

### Installer sur le téléphone
- **Android / Chrome** : menu ⋮ → *Ajouter à l'écran d'accueil*
- **iOS / Safari** : Partager → *Sur l'écran d'accueil*

---

## Architecture du style (important)

- La **prompt de style** et la **palette** ne sont **plus en dur** dans le code.
- Chaque utilisateur les définit dans l'app ; elles sont **stockées en local**
  et **envoyées avec chaque appel IA** (champ `stylePrompt`).
- Le serveur (`api/claude.js`) ne contient que les **instructions techniques**
  de chaque tâche (schémas JSON) et y ajoute le style de l'utilisateur.

Un **preset « exemple »** (style old money méditerranéen) est fourni : bouton
« Charger l'exemple » dans les onglets Palette et Prompt, pour démarrer vite.

---

## Consommation de tokens

Une seule clé, tous les utilisateurs dessus. Ce qui coûte :

| Action | Coût |
|---|---|
| Naviguer, consulter, filtrer, journal | **0** |
| Supprimer une pièce | **0** |
| Ajouter une pièce (analyse photo) | 1 petit appel |
| Générer les tenues d'une pièce ajoutée | 1 petit appel (incrémental) |
| Corriger une tenue (Miroir) | 1 petit appel |
| « Tout générer / régénérer » | 1 gros appel (rare) |

Les tenues générées sont mises en cache local → consultables hors-ligne, sans
re-payer. On ne rappelle l'API que quand la garde-robe change.

**Garde-fou :** chaque tenue renvoyée par l'IA est validée localement (pièce
existante, un haut + un bas, pas deux accents, ceinture seulement si passants)
avant d'être enregistrée.

---

## Publier une mise à jour

Bumper le numéro aux **3 endroits** : `version.json`, `APP_VERSION` dans
`index.html`, `CACHE` dans `sw.js`. Push → Vercel redéploie.
