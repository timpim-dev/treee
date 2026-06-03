/**
 * PocketBase Schema Merger Utility
 * 
 * Instructions:
 * 1. Export your existing collections from the PocketBase Admin UI:
 *    Settings -> Export collections -> Copy the JSON or save it.
 * 2. Save your exported JSON into a file named 'pb_schema_export.json' in this directory.
 * 3. Run this script using Node.js:
 *    node merge_pb_schema.js
 * 4. A new file 'pb_schema_merged.json' will be created.
 * 5. Import the merged schema into PocketBase:
 *    Settings -> Import collections -> Load pb_schema_merged.json -> Click Import.
 */

import fs from 'fs';
import path from 'path';

const GAME_SCHEMA_FILE = 'pocketbase_schema_import.json';
const USER_SCHEMA_FILE = 'pb_schema_export.json';
const OUTPUT_SCHEMA_FILE = 'pb_schema_merged.json';

function merge() {
  console.log('--- PocketBase Schema Merger ---');

  // Verify game schema exists
  if (!fs.existsSync(GAME_SCHEMA_FILE)) {
    console.error(`Error: Game schema template '${GAME_SCHEMA_FILE}' not found in current directory.`);
    process.exit(1);
  }

  // Check if user exported schema file is present
  if (!fs.existsSync(USER_SCHEMA_FILE)) {
    console.log(`\n[Action Required]`);
    console.log(`Please export your current collections from your PocketBase Admin dashboard:`);
    console.log(`  1. Go to Settings -> Export collections.`);
    console.log(`  2. Save/paste the JSON array into a file named '${USER_SCHEMA_FILE}' in the project root.`);
    console.log(`  3. Re-run: node merge_pb_schema.js\n`);
    process.exit(1);
  }

  try {
    const gameCollections = JSON.parse(fs.readFileSync(GAME_SCHEMA_FILE, 'utf8'));
    const userCollections = JSON.parse(fs.readFileSync(USER_SCHEMA_FILE, 'utf8'));

    if (!Array.isArray(gameCollections) || !Array.isArray(userCollections)) {
      throw new Error('Both schema files must contain a JSON array of collections.');
    }

    console.log(`Loaded ${userCollections.length} existing collections from '${USER_SCHEMA_FILE}'.`);
    console.log(`Loaded ${gameCollections.length} game collections from '${GAME_SCHEMA_FILE}'.`);

    // We will merge game collections into user collections array
    const merged = [...userCollections];

    for (const gameCol of gameCollections) {
      const existingIdx = merged.findIndex(
        col => col.name === gameCol.name || col.id === gameCol.id
      );

      if (existingIdx !== -1) {
        console.log(`Updating existing collection: '${gameCol.name}'`);
        // Replace existing collection with the game's definition (with the correct public rules)
        merged[existingIdx] = gameCol;
      } else {
        console.log(`Adding new collection: '${gameCol.name}'`);
        merged.push(gameCol);
      }
    }

    fs.writeFileSync(OUTPUT_SCHEMA_FILE, JSON.stringify(merged, null, 2), 'utf8');
    
    console.log(`\nSuccess! Created '${OUTPUT_SCHEMA_FILE}' with ${merged.length} total collections.`);
    console.log(`To import:`);
    console.log(`  1. Go to PocketBase Admin -> Settings -> Import collections.`);
    console.log(`  2. Click 'Load JSON' and select '${OUTPUT_SCHEMA_FILE}'.`);
    console.log(`  3. Verify the changes and click 'Import'.`);
    console.log(`\nYour other collections (like ag_users, ar_users, etc.) have been preserved!`);
  } catch (error) {
    console.error('Merge failed with error:', error.message);
    process.exit(1);
  }
}

merge();
