export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // TURN_ICE_JSON should be JSON string like: { "iceServers": [ {"urls": ["stun:..."], "username": "user", "credential": "pass"} ] }
  const raw = process.env.TURN_ICE_JSON || null;
  if (!raw) {
    // default to public STUN only
    return res.json({ iceServers: [ { urls: ['stun:stun.l.google.com:19302'] } ] });
  }
  try {
    const parsed = JSON.parse(raw);
    return res.json(parsed);
  } catch (e) {
    console.warn('Failed to parse TURN_ICE_JSON', e);
    return res.status(500).json({ error: 'invalid_turn_config' });
  }
}
