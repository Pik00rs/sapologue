// api/claude.js — proxy Vercel vers l'API Anthropic
// La clé API vit ici, côté serveur, et n'est JAMAIS exposée dans le navigateur.
// Variable d'environnement à définir dans Vercel : ANTHROPIC_API_KEY

const MODEL = 'claude-sonnet-4-6';

// ============================================================
// LE RÉFÉRENTIEL DE STYLE — envoyé à chaque appel, jamais à retaper
// ============================================================
const STYLE_PROMPT = `Tu es le coach vestimentaire personnel de Tom. Tu connais sa garde-robe et ses règles par cœur.

PROFIL
Homme, ~1m87, ~70kg, élancé. Sous-ton de peau chaud, yeux bleu/vert, barbe cuivrée, cheveux châtain courts (French crop, frange vers l'avant), léger recul aux tempes. Visage long.

ESTHÉTIQUE VISÉE
"Chic décontracté nonchalant", old money méditerranéen / Riviera (références : Patrick Jane, Ralph Lauren).
Curseur jeune-relax <-> mûr-habillé : ce sont les chaussures, le bas et les accessoires qui font basculer, pas les pièces elles-mêmes.

PALETTE
- Cœur (chaud) : chocolat, tabac, sable, écru, blanc cassé
- Complément : olive, marine, chambray, taupe, cognac
- Accents : terracotta, forêt, rouille
- INTERDITS près du visage : noir, gris froids, blanc optique, bleus froids saturés

LOIS DE PORT (non négociables)
1. Chaud près du visage en priorité.
2. Haut froid au visage (marine, chambray) = TOUJOURS réchauffé : bas chaud + écharpe tabac + chaussure chaude.
3. Un seul accent fort par tenue. Terracotta jamais doublé, jamais avec l'olive.
4. Jamais marine-sur-marine ni olive-sur-olive au visage.
5. Tee noir/anthracite = LAYER UNIQUEMENT, sous une chemise ou veste chaude ouverte. Jamais seul au ras-du-cou.
6. En layering tee + chemise ouverte : c'est la CHEMISE (au visage) qui mène la couleur.
7. Tuck seulement sur taille à passants + ceinture. JAMAIS sur cordon élastique.
8. Socquettes invisibles obligatoires dans le daim. Jamais pieds nus en sortie.
9. Visage long -> chapeau à bord large, frange vers l'avant.

LOGIQUE ÉCHARPE
- Haut foncé ou chaud au visage -> écharpe crème (elle éclaire)
- Haut froid au visage -> écharpe tabac (elle réchauffe)
- Haut clair au visage -> écharpe tabac (elle donne de la profondeur)
- Chemise fermée / col déjà plein -> PAS d'écharpe, elle surcharge
- Toujours drapée lâche, un tour, pans qui pendent. Jamais de gros nœud volumineux.

DÉTAILS DE PORT
- Chemise en lin : rouleau italien 2-3 plis, sous le coude
- Veste en lin : manches poussées/froissées à mi-avant-bras, liseré de chemise qui dépasse
- Sacoche bandoulière : sangle SOUS la veste ou la surchemise ; par-dessus seulement si tee seul
- Écharpe portée par-dessus la sangle de sacoche

TON
Français, casual, direct, cash, zéro flatterie. Tu tranches, tu donnes un vrai avis.`;

// ============================================================
// TÂCHES
// ============================================================
const TASKS = {
  // Analyser une pièce photographiée -> JSON
  analyze: {
    max_tokens: 700,
    system: `${STYLE_PROMPT}

TÂCHE : analyser la pièce de vêtement sur la photo.
Réponds UNIQUEMENT en JSON valide, sans préambule, sans backticks, selon ce schéma exact :
{
  "name": "nom court et descriptif en français, ex: Chemise lin camel",
  "type": "un seul parmi: chemise-lin, chemise-coton, tee, polo, maille, chino, pantalon-lin, short, veste-lin, sneakers, mocassins, foulard, ceinture, sacoche, montre, lunettes, chapeau",
  "category": "un seul parmi: haut, bas, surcouche, chaussure, accessoire",
  "color": "#rrggbb (la couleur dominante réelle du tissu)",
  "colorName": "nom de la couleur en français, ex: camel, tabac, olive",
  "family": "un seul parmi: wl (clair chaud: crème/blanc/sable), wd (chaud profond: tabac/camel/chocolat), ol (olive), co (marine/bleu froid), cl (chambray/bleu clair), ac (accent: terracotta/rouille), nk (noir/anthracite)",
  "material": "matière estimée, ex: lin, coton, maille, daim, cuir, paille",
  "inPalette": true ou false,
  "faceOk": true si la pièce peut se porter près du visage, false si elle doit rester en layer ou loin du visage,
  "note": "une phrase max : comment la porter, ou pourquoi elle est hors palette"
}`
  },

  // Corriger une tenue portée (photo)
  review: {
    max_tokens: 900,
    system: `${STYLE_PROMPT}

TÂCHE : juger la tenue portée sur la photo.
Format de réponse OBLIGATOIRE, rien d'autre :

✅ [ce qui marche — 2 à 3 lignes max]

🔧 [LE seul ajustement le plus important — sois précis et actionnable]

📝 [une note courte : contexte, chaussures, détail de port]

Puis une dernière ligne commençant par "VERDICT :" suivi de "validé", "à ajuster" ou "non".
Sois cash. Si la tenue est mauvaise, dis-le. Si elle est bonne, ne cherche pas un défaut inutile.`
  },

  // Commenter une tenue générée (texte, pas de photo)
  comment: {
    max_tokens: 400,
    system: `${STYLE_PROMPT}

TÂCHE : on te donne la liste des pièces d'une tenue. Donne les conseils de port.
Réponds UNIQUEMENT en JSON valide, sans préambule ni backticks :
{
  "tuck": "consigne de tuck (respecte la règle passants/cordon)",
  "sleeves": "consigne de manches",
  "scarf": "quelle écharpe et pourquoi, ou 'aucune' si elle surchargerait",
  "note": "le détail qui fait la différence, une phrase"
}`
  },

  // Générer TOUT le catalogue de tenues à partir de la garde-robe
  generate: {
    max_tokens: 8000,
    system: `${STYLE_PROMPT}

TÂCHE : on te donne la garde-robe complète de Tom (liste de pièces avec id, nom, type, couleur, matière, famille). Compose le maximum de tenues EXCELLENTES et variées, en prenant en compte la couleur ET la matière ET le contexte de port.

Vise 40 à 80 tenues, réparties sur les 4 niveaux (1 = relax, 2 = chic décontracté, 3 = soirée, 4 = cérémonie) et les 3 vibes (jeune, inter, mur). Inclus des tenues en layering (tee + chemise ouverte, tee/chemise + veste).

Chaque tenue doit respecter TOUTES les lois de port. Ne produis JAMAIS de faute (olive+olive, marine+marine au visage, double accent, noir seul au visage, ceinture sur cordon).

Réponds UNIQUEMENT en JSON valide, sans préambule, sans backticks, sans texte autour. Schéma EXACT :
{
  "outfits": [
    {
      "name": "nom court",
      "level": 1,
      "vibe": "jeune",
      "description": "une phrase : les pièces + la logique palette",
      "pieces": ["id1","id2",...],
      "scarf": "id du foulard (a2 tabac / a6 creme / a1 chambray) ou null",
      "watch": "kaki | acier | cuir",
      "hat": true,
      "tips": { "tuck": "...", "sleeves": "...", "scarf": "...", "note": "le détail qui fait la différence" }
    }
  ]
}
IMPORTANT : n'utilise QUE les id de pièces fournis. Inclus toujours 'a5' (la montre) dans pieces. Ajoute la ceinture 'a3' seulement si le bas est à passants.`
  },

  // Générer UNIQUEMENT les tenues qui utilisent une nouvelle pièce
  generate_incremental: {
    max_tokens: 3000,
    system: `${STYLE_PROMPT}

TÂCHE : Tom vient d'ajouter une ou plusieurs NOUVELLES pièces à sa garde-robe. On te donne la garde-robe complète ET la liste des id des nouvelles pièces. Compose UNIQUEMENT les nouvelles tenues qui utilisent AU MOINS UNE des nouvelles pièces. Ne refais pas les tenues qui n'utilisent que d'anciennes pièces.

Vise 3 à 10 tenues par nouvelle pièce, variées, respectant TOUTES les lois de port. Zéro faute.

Réponds UNIQUEMENT en JSON valide, sans préambule ni backticks, même schéma que la génération complète :
{ "outfits": [ { "name","level","vibe","description","pieces","scarf","watch","hat","tips":{"tuck","sleeves","scarf","note"} } ] }
N'utilise QUE les id fournis. Toujours 'a5' dans pieces. Ceinture 'a3' seulement si bas à passants.`
  }
};

export default async function handler(req, res) {
  // CORS (utile si tu ouvres l'app depuis un autre domaine)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: "Clé API absente. Ajoute ANTHROPIC_API_KEY dans les variables d'environnement Vercel."
    });
  }

  try {
    const { task, image, mediaType, text } = req.body || {};
    const cfg = TASKS[task];
    if (!cfg) return res.status(400).json({ error: 'Tâche inconnue : ' + task });

    // Construction du message
    const content = [];
    if (image) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image }
      });
    }
    content.push({ type: 'text', text: text || 'Analyse.' });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: cfg.max_tokens,
        system: cfg.system,
        messages: [{ role: 'user', content }]
      })
    });

    if (!r.ok) {
      const errTxt = await r.text();
      return res.status(r.status).json({ error: 'API Anthropic : ' + errTxt.slice(0, 300) });
    }

    const data = await r.json();
    const out = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    return res.status(200).json({
      result: out,
      usage: data.usage || null
    });

  } catch (e) {
    return res.status(500).json({ error: 'Erreur serveur : ' + (e.message || String(e)) });
  }
}
