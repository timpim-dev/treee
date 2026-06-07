import Ably from 'ably';

export default async function handler(req, res) {
  // Allow simple CORS for Vercel serverless usage
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = process.env.ABLY_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'Missing ABLY_API_KEY on server' });

  try {
    const rest = new Ably.Rest({ key: API_KEY });
    // allow optional clientId in request body
    const opts = {};
    if (req.body && req.body.clientId) opts.clientId = req.body.clientId;
    // tokenParams may include ttl or capability
    const tokenParams = req.body && req.body.tokenParams ? req.body.tokenParams : undefined;

    rest.auth.createTokenRequest(tokenParams || {}, (err, tokenRequest) => {
      if (err) {
        console.warn('Ably createTokenRequest failed', err);
        return res.status(500).json({ error: 'token_request_failed', detail: String(err && err.message) });
      }
      return res.json(tokenRequest);
    });
  } catch (e) {
    console.warn('Ably token endpoint error', e);
    return res.status(500).json({ error: 'internal', detail: String(e && e.message) });
  }
}
