// api/claude.js — proxy Vercel vers l'API Anthropic (multi-utilisateurs)
// La clé API vit ici, côté serveur, jamais dans le navigateur.
// Variable d'environnement Vercel : ANTHROPIC_API_KEY
//
// Le PROMPT DE STYLE et la PALETTE viennent du client (chaque utilisateur a les siens),
// envoyés dans le champ `stylePrompt`. Le serveur ne fait qu'y ajouter les
// instructions techniques propres à chaque tâche.

const MODEL = 'claude-sonnet-4-6';           // par défaut (analyse, miroir, palette)
const MODEL_GENERATE = 'claude-opus-5';       // génération de tenues (plus fin sur le style + les détails de port)

const FALLBACK_STYLE = `Tu es un coach vestimentaire personnel. Tu composes et juges des tenues coherentes, flatteuses et bien portees. Ton : francais, direct, cash, sans flatterie.`;

const TASKS = {
  analyze: {
    max_tokens: 700,
    instructions: `TÂCHE : analyser la pièce de vêtement sur la photo.
Réponds UNIQUEMENT en JSON valide, sans préambule ni backticks, selon ce schéma exact :
{
  "name": "nom court et simple, SANS la marque, ex: Chemise lin camel, Tee coton écru",
  "type": "un seul parmi: chemise-lin, chemise-coton, tee, polo, maille, chino, pantalon-lin, short, veste-lin, sneakers, mocassins, foulard, ceinture, sacoche, montre, lunettes, chapeau",
  "category": "un seul parmi: haut, bas, surcouche, chaussure, accessoire",
  "color": "#rrggbb (couleur dominante réelle du tissu)",
  "colorName": "nom de la couleur en français",
  "family": "un seul parmi: wl (clair chaud), wd (chaud profond), ol (olive/vert), co (marine/bleu froid), cl (bleu clair/chambray), ac (accent vif: terracotta/rouille/rouge), nk (noir/anthracite)",
  "material": "matière estimée (lin, coton, maille, daim, cuir, paille...)",
  "tuckable": true si c'est un bas à passants (chino, pantalon) rentrable avec ceinture, false sinon,
  "inPalette": true ou false selon la palette de l'utilisateur ci-dessus,
  "faceOk": true si la pièce peut se porter près du visage, false sinon,
  "note": "une phrase : comment la porter, ou pourquoi elle est hors palette"
}`
  },

  review: {
    max_tokens: 900,
    instructions: `TÂCHE : juger la tenue portée sur la photo, selon le style et la palette ci-dessus.
Format de réponse OBLIGATOIRE, rien d'autre :

✅ [ce qui marche — 2 à 3 lignes max]

🔧 [LE seul ajustement le plus important — précis et actionnable]

📝 [une note courte : contexte, chaussures, détail de port]

Dernière ligne commençant par "VERDICT :" suivi de "validé", "à ajuster" ou "non".
Sois cash.`
  },

  comment: {
    max_tokens: 400,
    instructions: `TÂCHE : on te donne les pièces d'une tenue. Donne les conseils de port selon le style ci-dessus.
Réponds UNIQUEMENT en JSON valide : { "tuck": "...", "sleeves": "...", "scarf": "... ou 'aucune'", "note": "le détail qui fait la différence" }`
  },

  generate: {
    max_tokens: 16000,
    instructions: `TÂCHE : on te donne la garde-robe complète de l'utilisateur (JSON : id, nom, type, couleur, matière, famille, passants). Compose des tenues EXCELLENTES et variées, en respectant SA palette et SON style ci-dessus, en tenant compte de la couleur, de la matière ET du contexte.

Vise 15 à 25 tenues réparties sur 4 niveaux (1=relax, 2=chic décontracté, 3=soirée, 4=cérémonie) et 3 vibes (jeune, inter, mur). Inclus du layering.

POINT CLÉ : pour CHAQUE tenue, explique en détail COMMENT LA PORTER. Sois précis et concret, pas générique. Pense à tout :
- tuck : rentré / demi-tuck / front-tuck / sorti, et pourquoi (respecte : tuck seulement si le bas a des passants, jamais sur cordon)
- sleeves : retroussage des manches (rouleau italien 2-3 plis sous le coude pour une chemise ; manches de veste poussées/froissées à mi-avant-bras ; tee retroussé 1 pli ; ou telles quelles)
- hem : bas du pantalon (ourlet net, léger break, ou retroussé/roulé une fois), et longueur idéale
- buttons : combien de boutons ouverts au col, chemise sous veste ouverte ou fermée
- scarf : quelle écharpe et comment la draper (ou aucune si ça surcharge)
- shoes : quelles chaussures + chaussettes (socquettes invisibles dans le daim, etc.)
- accessories : ceinture (couleur, seulement si passants), montre, chapeau, sacoche (comment porter la sangle)
- note : le détail final qui fait la différence, le "pourquoi ça marche" côté palette/silhouette

Réponds UNIQUEMENT en JSON valide, sans préambule ni backticks. Schéma EXACT :
{ "outfits": [ {
  "name": "nom court",
  "level": 1,
  "vibe": "jeune",
  "description": "une phrase : l'esprit de la tenue",
  "pieces": ["id1","id2"],
  "scarf": "id du foulard ou null",
  "watch": "kaki | acier | cuir",
  "hat": true,
  "tips": {
    "tuck": "...",
    "sleeves": "...",
    "hem": "...",
    "buttons": "...",
    "scarf": "...",
    "shoes": "...",
    "accessories": "...",
    "note": "..."
  }
} ] }
N'utilise QUE les id de pièces réellement fournis dans la garde-robe. N'invente jamais d'id (montre, ceinture, etc.). Ceinture seulement si le bas a des passants (passants=true). IMPORTANT : ne donne de conseil sur une écharpe/foulard, une montre, un chapeau ou une ceinture QUE si ce type de pièce est présent dans la garde-robe fournie ; sinon laisse ces champs vides. Ne suggère jamais un accessoire que l'utilisateur ne possède pas.`
  },

  generate_incremental: {
    max_tokens: 6000,
    instructions: `TÂCHE : l'utilisateur vient d'ajouter des NOUVELLES pièces. On te donne sa garde-robe complète ET la liste des id des nouvelles pièces. Compose UNIQUEMENT les nouvelles tenues qui utilisent AU MOINS UNE nouvelle pièce, selon sa palette et son style ci-dessus.

Vise 3 à 8 tenues par nouvelle pièce, variées, zéro faute. Pour CHAQUE tenue, explique en détail comment la porter (tuck, retroussage des manches, ourlet du pantalon, boutons, écharpe et drapé, chaussures + chaussettes, accessoires) — précis et concret.

Réponds UNIQUEMENT en JSON valide, même schéma que la génération complète :
{ "outfits": [ { "name","level","vibe","description","pieces","scarf","watch","hat","tips":{"tuck","sleeves","hem","buttons","scarf","shoes","accessories","note"} } ] }
N'utilise QUE les id fournis. N'invente jamais d'id.`
  },

  gaps: {
    max_tokens: 4000,
    instructions: `TÂCHE : analyser la garde-robe de l'utilisateur (JSON fourni : id, nom, type, couleur, matière, famille, passants) et identifier les PIÈCES MANQUANTES les plus utiles à acheter, selon SA palette et SON style ci-dessus.

Raisonne comme un styliste : quels trous dans la garde-robe ? Quelles pièces débloqueraient le plus de nouvelles tenues ? Qu'est-ce qui manque pour couvrir les différents niveaux (relax → soirée) ? Reste fidèle à sa palette et à ses matières.

Propose 5 à 10 pièces, classées de la plus prioritaire à la moins. Pour chacune, sois précis (type, couleur dans sa palette, matière) et explique POURQUOI (ce que ça débloque, quel trou ça comble).

Réponds UNIQUEMENT en JSON valide, sans préambule ni backticks :
{
  "analysis": "2-3 phrases : l'état de la garde-robe, ses forces et ses manques principaux",
  "suggestions": [
    {
      "name": "ex: Chemise en lin blanc cassé",
      "type": "ex: chemise-lin",
      "color": "#rrggbb",
      "colorName": "ex: blanc cassé",
      "material": "ex: lin",
      "priority": "haute | moyenne | basse",
      "why": "une phrase : ce que ça débloque / le trou comblé",
      "pairsWith": "avec quelles pièces existantes ça se combine (noms)"
    }
  ]
}`
  },

  palette: {
    max_tokens: 1500,
    instructions: `TÂCHE : l'utilisateur décrit sa palette (ambiance, couleurs qu'il aime, ce qu'il évite). Génère une palette structurée et riche, en tenant compte de son profil et de son style ci-dessus.

Organise en 3 familles (ex : « Neutres chauds », « Complémentaires », « Accents »). Chaque famille contient plusieurs COULEURS NOMMÉES (ex : Chocolat, Tabac, Olive, Marine…), et chaque couleur a un dégradé de 5 nuances du plus clair au plus foncé. Ajoute aussi une liste « à éviter près du visage ».

Réponds UNIQUEMENT en JSON valide, sans préambule ni backticks :
{
  "groups": [
    { "group": "Neutres chauds", "tag": "le cœur", "colors": [
      { "name": "Chocolat", "stops": ["#rrggbb","#rrggbb","#rrggbb","#rrggbb","#rrggbb"] },
      { "name": "Tabac", "stops": ["#rrggbb","#rrggbb","#rrggbb","#rrggbb","#rrggbb"] }
    ] }
  ],
  "avoid": [
    { "name": "Noir froid", "hex": "#rrggbb" }
  ]
}
Chaque "stops" a exactement 5 nuances ordonnées clair -> foncé. Reste fidèle aux teintes décrites.`
  }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Clé API absente. Ajoute ANTHROPIC_API_KEY dans Vercel, puis redéploie." });
  }

  try {
    const { task, image, mediaType, text, stylePrompt } = req.body || {};
    const cfg = TASKS[task];
    if (!cfg) return res.status(400).json({ error: 'Tâche inconnue : ' + task });

    const style = (stylePrompt && stylePrompt.trim()) ? stylePrompt.trim() : FALLBACK_STYLE;
    const system = style + '\n\n---\n\n' + cfg.instructions;

    const content = [];
    if (image) {
      content.push({ type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } });
    }
    content.push({ type: 'text', text: text || 'Analyse.' });

    const model = (task === 'generate' || task === 'generate_incremental') ? MODEL_GENERATE : MODEL;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: cfg.max_tokens, system, messages: [{ role: 'user', content }] })
    });

    if (!r.ok) {
      const errTxt = await r.text();
      return res.status(r.status).json({ error: 'API Anthropic : ' + errTxt.slice(0, 300) });
    }

    const data = await r.json();
    const out = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    return res.status(200).json({ result: out, usage: data.usage || null });

  } catch (e) {
    return res.status(500).json({ error: 'Erreur serveur : ' + (e.message || String(e)) });
  }
}
