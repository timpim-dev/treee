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
    // Respond with a join URL for the streamer (use streamer slug = channel name)
    // The game expects ?join=slug where slug is the streamer's slug/identifier
    const slug = (channel.replace('#','') || CHANNEL);
    const url = `${GAME_BASE_URL}/?join=${encodeURIComponent(slug)}`;
    const safe = `Join ${slug}'s room: ${url}`;
    try {
      await client.say(channel, safe);
    } catch (e) {
      console.warn('failed to send join message', e);
    }
  }
});
