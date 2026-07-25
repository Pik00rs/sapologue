# Garde-robe v11 — PWA + IA

App garde-robe perso : catalogue, générateur de tenues, journal de port,
analyse de pièces et correction de tenues par Claude.

Hébergée sur **Vercel** (l'app + l'API dans le même déploiement).

---

## 1. Déploiement

### Structure
```
/
├── index.html              l'app entière
├── sw.js                   service worker (hors-ligne)
├── manifest.json           installable
├── version.json            numéro de version
├── vercel.json             config headers
├── package.json
├── icon-*.png              icônes
└── api/
    └── claude.js           proxy vers l'API Anthropic
```

### Étapes

1. Pousser tous ces fichiers sur un repo GitHub.
2. Sur [vercel.com](https://vercel.com) → **Add New… → Project** → importer le repo.
3. Framework Preset : **Other**. Ne rien changer d'autre. **Deploy**.
4. **⚠️ Étape indispensable** — Projet → **Settings → Environment Variables** :

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | ta clé `sk-ant-…` |

   Cocher les 3 environnements (Production / Preview / Development) → **Save**.
5. **Redéployer** (Deployments → … → Redeploy) pour que la clé soit prise en compte.

Ton app est en ligne sur `https://<projet>.vercel.app`.

> **Ta clé n'est jamais dans le navigateur.** Elle reste sur le serveur Vercel.
> Le code public appelle `/api/claude`, qui ajoute la clé côté serveur.

### Installer sur le téléphone
- **Android / Chrome** : menu ⋮ → *Ajouter à l'écran d'accueil*
- **iOS / Safari** : Partager → *Sur l'écran d'accueil*

---

## 2. Consommation de tokens

**90 % de l'app ne consomme rien.** Tout tourne en local, même hors-ligne :

| Fonction | Coût |
|---|---|
| Catalogue, onglet Tenues, filtres | **0** |
| Aléatoire, journal, photos | **0** |
| Consulter les tenues déjà générées | **0** (cache local) |
| Supprimer une pièce | **0** (retrait local) |
| Analyse d'une pièce photographiée | 1 petit appel |
| Correction d'une tenue (Miroir) | 1 petit appel |
| Générer les tenues d'une pièce ajoutée | 1 petit appel (incrémental) |
| « Tout générer / régénérer » | 1 gros appel (rare) |

Le référentiel de style (palette, lois de port, logique écharpe) est **dans
`api/claude.js`** : il part avec chaque appel, tu n'as jamais à le retaper.

Pour le modifier : éditer la constante `STYLE_PROMPT` dans `api/claude.js`.

---

## 3. Ce que fait l'app

### Pièces
Classées par sous-catégories. Clic sur une pièce → détail + photo + « voir les
tenues avec cette pièce ».

**Ajouter une pièce** (bouton +) :
1. Photo de la pièce
2. *Analyser la photo* → Claude détecte **nom, type, couleur exacte, matière,
   famille colorimétrique**, et dit si c'est dans ta palette
3. Tu corriges si besoin, tu ajoutes la marque, tu valides
4. **Le générateur recompose immédiatement toutes les tenues possibles** avec
   cette pièce et tout le reste de ta garde-robe (en local, instantané)

### Tenues
- **105 tenues curatées** (écrites à la main, avec les conseils de port détaillés)
- **+ tenues générées par Claude** — il compose en prenant en compte couleur,
  **matière**, style et contexte (ce qu'un algorithme ne sait pas faire)

**Génération (100 % Claude, tokens maîtrisés) :**
- **« Générer mes tenues »** (onglet Tenues) → gros appel, rare : Claude compose
  tout le catalogue à partir de ta garde-robe. À faire une fois au début.
- **Ajout d'une pièce → génération incrémentale** : l'app ne recompose QUE les
  tenues de la nouvelle pièce (petit appel), pas tout le catalogue.
- **Ajouts multiples regroupés** : si tu ajoutes plusieurs pièces, elles s'empilent
  en file d'attente → un seul appel pour toutes.
- **Suppression d'une pièce → 0 token** : ses tenues sont retirées localement.
- **Cache local** : une fois généré, tu consultes / filtres / tires à l'aléatoire
  **hors-ligne, sans token**. Tu ne rappelles l'API que quand la garde-robe change.

**Garde-fou :** chaque tenue renvoyée par Claude est validée localement avant
d'être enregistrée (jamais olive+olive, marine+marine, double accent, noir seul
au visage, ceinture sur cordon). Si Claude se trompe, l'app écarte la tenue.

Chaque tenue affiche : pièces, écharpe résolue, verdict chapeau, sélecteur de
montre (NATO / Acier / Cuir), conseils de port, photo, bouton « porté aujourd'hui ».

### Aléatoire
Multi-niveaux, multi-styles, filtre short, inclure/exclure des pièces, mode valise.

### Miroir
Photo de ta tenue → Claude la corrige selon ta palette :
ce qui marche / l'ajustement prioritaire / la note + un verdict.

### Journal
Historique daté des ports, stats (total, 30 derniers jours, tenue la plus portée),
export / import JSON complet (photos comprises).

---

## 4. Publier une mise à jour

Bumper le numéro **aux trois endroits** :

1. `version.json` → `"version": "11.1"`
2. `index.html` → `const APP_VERSION = '11.1';`
3. `sw.js` → `const CACHE = 'garde-robe-v11.1';`

Push → Vercel redéploie tout seul. La bannière « Nouvelle version disponible »
apparaît au prochain lancement.

> Le point 3 est le plus oublié : sans changement du nom de cache, le service
> worker continue de servir les anciens fichiers.

---

## 5. Données

- Réglages, ports, journal, valise → `localStorage`
- Photos → `IndexedDB` (compressées à 900 px / JPEG, ~100 Ko pièce)

Tout est **stocké sur l'appareil**, rien sur un serveur.
→ **Exporter depuis l'onglet Journal avant de changer de téléphone.**
