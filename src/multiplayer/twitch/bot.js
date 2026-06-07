// Minimal Twitch bot scaffold for !join command
// Usage: npm install tmi.js && TWITCH_USERNAME=botname TWITCH_OAUTH=oauth:xxx CHANNEL=streamer_channel GAME_BASE_URL=https://yourgame.example node bot.js

const tmi = require('tmi.js');
const GAME_BASE_URL = process.env.GAME_BASE_URL || 'http://localhost:3000';
const CHANNEL = process.env.CHANNEL;
const USERNAME = process.env.TWITCH_USERNAME;
const OAUTH = process.env.TWITCH_OAUTH; // must be in form oauth:xxxx

if (!CHANNEL || !USERNAME || !OAUTH) {
  console.error('Missing env vars. Set CHANNEL, TWITCH_USERNAME, TWITCH_OAUTH, GAME_BASE_URL');
  process.exit(1);
}

const client = new tmi.Client({
  identity: { username: USERNAME, password: OAUTH },
  channels: [ CHANNEL ]
});

client.connect().then(() => console.log('Twitch bot connected')).catch(err => { console.error('tmi connect failed', err); process.exit(1); });

client.on('message', async (channel, tags, message, self) => {
  if (self) return;
  const msg = (message || '').trim();
  if (!msg) return;
  if (msg.toLowerCase() === '!join') {
    const slug = (channel.replace('#','') || CHANNEL);
    const joinUrl = `${GAME_BASE_URL}/?join=${encodeURIComponent(slug)}`;

    // Attempt to ensure room on signaling server before replying so join link is reliable
    const SIGNALING_URL = process.env.SIGNALING_URL || 'http://localhost:8081';
    // optional webhook to notify streamer client/runner to create host room
    const WEBHOOK = process.env.HOST_WEBHOOK || null;

    // Ensure fetch exists (Node 18+ has global fetch)
    let nodeFetch = global.fetch;
    if (typeof nodeFetch !== 'function') {
      try { nodeFetch = require('node-fetch'); } catch (e) { nodeFetch = null; }
    }

    if (nodeFetch) {
      try {
        const code = (slug || '').toUpperCase();
        const body = { code, owner: slug, ttl: 3600 };
        if (WEBHOOK) body.webhook = WEBHOOK;
        const res = await nodeFetch(SIGNALING_URL.replace(/\/+$/, '') + '/api/rooms/ensure', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (res) {
          const j = await res.json().catch(() => null);
          // proceed regardless of outcome; if conflict, room likely exists
          const safe = `Join ${slug}'s room: ${joinUrl}`;
          await client.say(channel, safe);
          return;
        }
      } catch (e) {
        console.warn('signaling ensure attempt failed', e);
        // Fall through and still send join URL
      }
    }

    // Fallback: just reply with URL
    const safe = `Join ${slug}'s room: ${joinUrl}`;
    try {
      await client.say(channel, safe);
    } catch (e) {
      console.warn('failed to send join message', e);
    }
  }
});
