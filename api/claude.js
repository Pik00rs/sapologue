// api/claude.js — proxy Vercel vers l'API Anthropic (multi-utilisateurs)
// La clé API vit ici, côté serveur, jamais dans le navigateur.
// Variable d'environnement Vercel : ANTHROPIC_API_KEY
//
// Le PROMPT DE STYLE et la PALETTE viennent du client (chaque utilisateur a les siens),
// envoyés dans le champ `stylePrompt`. Le serveur ne fait qu'y ajouter les
// instructions techniques propres à chaque tâche.

const MODEL = 'claude-sonnet-4-6';

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
    max_tokens: 8000,
    instructions: `TÂCHE : on te donne la garde-robe complète de l'utilisateur (JSON : id, nom, type, couleur, matière, famille, passants). Compose des tenues EXCELLENTES et variées, en respectant SA palette et SON style ci-dessus, et en tenant compte de la couleur ET de la matière ET du contexte.

Vise 15 à 30 tenues réparties sur 4 niveaux (1=relax, 2=chic décontracté, 3=soirée, 4=cérémonie) et 3 vibes (jeune, inter, mur). Inclus du layering. Garde descriptions et tips COURTS (une phrase max) pour tenir dans la réponse.

Réponds UNIQUEMENT en JSON valide, sans préambule ni backticks. Schéma EXACT :
{ "outfits": [ {
  "name": "nom court", "level": 1, "vibe": "jeune",
  "description": "une phrase courte",
  "pieces": ["id1","id2"],
  "scarf": "id du foulard ou null",
  "watch": "kaki | acier | cuir",
  "hat": true,
  "tips": { "tuck": "court", "sleeves": "court", "scarf": "court", "note": "court" }
} ] }
N'utilise QUE les id de pièces réellement fournis dans la garde-robe. N'invente jamais d'id (montre, ceinture, etc.). Ceinture seulement si le bas a des passants (passants=true).`
  },

  generate_incremental: {
    max_tokens: 3000,
    instructions: `TÂCHE : l'utilisateur vient d'ajouter des NOUVELLES pièces. On te donne sa garde-robe complète ET la liste des id des nouvelles pièces. Compose UNIQUEMENT les nouvelles tenues qui utilisent AU MOINS UNE nouvelle pièce, selon sa palette et son style ci-dessus.

Vise 3 à 10 tenues par nouvelle pièce, zéro faute.
Réponds UNIQUEMENT en JSON valide, même schéma que la génération complète :
{ "outfits": [ { "name","level","vibe","description","pieces","scarf","watch","hat","tips":{"tuck","sleeves","scarf","note"} } ] }
N'utilise QUE les id fournis.`
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

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: cfg.max_tokens, system, messages: [{ role: 'user', content }] })
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
