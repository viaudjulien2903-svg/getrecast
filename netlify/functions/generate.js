// netlify/functions/generate.js
// Appelle Claude API (Haiku) pour générer les contenus repurposés

const SYSTEM_PROMPT = `Tu es Recast, un expert en création de contenu digital. 
Ton rôle est de transformer un article de blog en contenus adaptés à chaque plateforme.

RÈGLES ABSOLUES :
- Conserve la voix et les idées originales de l'auteur
- Adapte le format et le style à chaque plateforme
- Ne copie JAMAIS mot pour mot l'article original
- Sois concis, percutant, engageant
- Utilise des emojis avec parcimonie (LinkedIn : 1-2 max, Twitter : 0-1)
- Réponds UNIQUEMENT en JSON valide, aucun texte avant ou après

FORMAT DE RÉPONSE (JSON strict) :
{
  "tweets": ["tweet 1", "tweet 2", "tweet 3", "tweet 4", "tweet 5"],
  "linkedin": ["post 1", "post 2", "post 3"],
  "newsletter": ["corps complet de l'email"],
  "script": ["script complet de la vidéo"]
}

N'inclus que les formats demandés dans ta réponse.

CONSIGNES PAR FORMAT :

TWEETS (si demandé) :
- 5 tweets DIFFÉRENTS basés sur l'article
- Max 280 caractères par tweet
- Hook fort dès la première ligne
- 1 tweet = 1 idée clé de l'article
- Pas de hashtags sauf si vraiment pertinent

LINKEDIN (si demandé) :
- 3 posts DIFFÉRENTS avec angles différents
- 150-300 mots chacun
- Structure : Accroche forte (1 ligne) → Développement → CTA
- Ton conversationnel et humain
- Aéré avec des retours à la ligne

NEWSLETTER (si demandé) :
- 1 email complet prêt à envoyer
- Structure : Objet suggéré en premier / Accroche / Corps / CTA / Signature
- 200-350 mots
- Ton personnel, comme une lettre à un ami

SCRIPT VIDÉO (si demandé) :
- 1 script complet pour une vidéo de 2-3 minutes
- Structure : INTRO HOOK (15s) / PROBLÈME (20s) / SOLUTION/CONTENU (90s) / CONCLUSION + CTA (15s)
- Indique les temps entre crochets [0:00]
- Inclus des indications de b-roll entre parenthèses (montrer X)
- Langage oral, naturel, comme si tu parlais face caméra`;

exports.handler = async function(event) {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { article, tone, formats } = JSON.parse(event.body);

    if (!article || article.length < 100) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Article trop court' }) };
    }

    const toneMap = {
      professionnel: 'Adopte un ton professionnel, sérieux et expert.',
      conversationnel: 'Adopte un ton conversationnel, chaleureux et humain.',
      inspirant: 'Adopte un ton inspirant, motivant et positif.',
      humoristique: 'Adopte un ton léger, humoristique et décalé.',
      educatif: 'Adopte un ton éducatif, pédagogique et précis.'
    };

    const formatsStr = formats.map(f => {
      const map = { tweets: 'TWEETS', linkedin: 'LINKEDIN', newsletter: 'NEWSLETTER', script: 'SCRIPT VIDÉO' };
      return map[f];
    }).join(', ');

    const userPrompt = `TON : ${toneMap[tone] || toneMap.conversationnel}

FORMATS À GÉNÉRER : ${formatsStr}

ARTICLE SOURCE :
"""
${article.substring(0, 8000)}
"""

Génère maintenant les contenus demandés en JSON. N'inclus dans le JSON que les clés correspondant aux formats demandés : ${formats.join(', ')}.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Claude API error:', err);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur API' }) };
    }

    const claudeData = await response.json();
    const rawText = claudeData.content[0].text;

    // Parse JSON — Claude Haiku retourne du JSON propre grâce au system prompt
    let parsed;
    try {
      // Nettoie les éventuels backticks
      const clean = rawText.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch(e) {
      console.error('JSON parse error:', rawText);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur de parsing' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch(err) {
    console.error('Function error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur serveur' }) };
  }
};
