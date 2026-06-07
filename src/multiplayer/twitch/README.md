Twitch bot scaffold for !join command

Usage:
1. Install dependency: npm install tmi.js
2. Create env vars and run:
   TWITCH_USERNAME=botname TWITCH_OAUTH=oauth:xxxx CHANNEL=streamer_channel GAME_BASE_URL=https://yourgame.example node ./src/multiplayer/twitch/bot.js

Notes:
- This is a minimal scaffold. The bot simply replies to '!join' with a URL that contains ?join=streamer_slug.
- For production use, run behind a process manager and secure the OAuth token.
- The bot assumes the streamer has created a multiplayer room with a code matching their slug (uppercased). Consider adding a server endpoint to atomically reserve a streamer's room when they toggle 'enable join'.
