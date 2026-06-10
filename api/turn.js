export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const raw = process.env.TURN_ICE_JSON || null;
  const fallback = { iceServers: [ { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] } ] };
  if (!raw || raw.trim() === '') {
    return res.json(fallback);
  }
  try {
    const parsed = JSON.parse(raw);
    return res.json(parsed);
  } catch (e) {
    console.warn('Failed to parse TURN_ICE_JSON, using fallback STUN', e);
    return res.json(fallback);
  }
}
