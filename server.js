import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Serve static files from dist folder (after building)
app.use(express.static(path.join(__dirname, 'dist')));

const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');

// Initialize leaderboard file if it doesn't exist
if (!fs.existsSync(LEADERBOARD_FILE)) {
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify([
    { name: "AetherLord", score: 25000, wave: 18, level: 32 },
    { name: "RuneSeeker", score: 18400, wave: 14, level: 25 },
    { name: "SpellWeaver", score: 12100, wave: 10, level: 19 },
    { name: "ManaBurn", score: 8500, wave: 8, level: 14 },
    { name: "NoviceMage", score: 3200, wave: 4, level: 8 }
  ], null, 2));
}

// API: Get Leaderboard
app.get('/api/leaderboard', (req, res) => {
  try {
    const data = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
    const leaderboard = JSON.parse(data);
    res.json(leaderboard.sort((a, b) => b.score - a.score));
  } catch (err) {
    res.status(500).json({ error: "Failed to read leaderboard" });
  }
});

// API: Submit Score
app.post('/api/leaderboard', (req, res) => {
  try {
    const { name, score, wave, level } = req.body;
    if (!name || typeof score !== 'number') {
      return res.status(400).json({ error: "Invalid submission data" });
    }

    const data = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
    const leaderboard = JSON.parse(data);

    leaderboard.push({ name: name.substring(0, 15), score, wave: wave || 1, level: level || 1 });
    // Sort and keep top 10
    const sorted = leaderboard.sort((a, b) => b.score - a.score).slice(0, 10);

    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(sorted, null, 2));
    res.json({ success: true, leaderboard: sorted });
  } catch (err) {
    res.status(500).json({ error: "Failed to submit score" });
  }
});

// For any other routes, serve index.html (client-side routing support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
