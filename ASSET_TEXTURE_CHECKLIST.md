# Asset Texture Checklist

Source: `src/engine/AssetManager.js`

This is the canonical checklist for the game's procedurally generated textures/sprites. Use it as the remake list when recreating art in Aseprite.

## Suggested Aseprite Structure

```text
aseprite/
  characters/
  enemies/
  bosses/
  companions/
  effects/
  items/
  world/
  ui/
  relics/
  equipment/
```

## 01 Characters

- [X] `player` (16x16, 3 frames)

## 02 Enemies

- [ ] `enemy_slime` (16x16, 2 frames)
- [ ] `enemy_skeleton` (16x16, 2 frames)
- [ ] `enemy_horror` (16x16, 2 frames)
- [ ] `enemy_warden` (16x16, 2 frames)
- [ ] `enemy_slime_elite` (16x16, 2 frames)
- [ ] `enemy_skeleton_elite` (16x16, 2 frames)
- [ ] `enemy_horror_elite` (16x16, 2 frames)

## 03 Bosses

- [ ] `boss_archon` (32x32, 1 frame)
- [ ] `boss_titan` (32x32, 1 frame)
- [ ] `boss_behemoth` (32x32, 1 frame)

## 04 Companions

- [ ] `item_wisp` (8x8, 1 frame)
- [ ] `pet_dragon` (16x16, 2 frames)
- [ ] `pet_griffin` (16x16, 2 frames)

## 05 Combat Effects

- [ ] `proj_fire` (8x8, 1 frame)
- [ ] `proj_frost` (8x8, 1 frame)
- [ ] `proj_lightning` (8x8, 1 frame)
- [ ] `proj_void` (8x8, 1 frame)
- [ ] `proj_flame_wave` (8x8, 1 frame)
- [ ] `proj_blizzard_orb` (8x8, 1 frame)

## 06 Pickups and World Objects

- [ ] `item_shard` (8x8, 1 frame)
- [ ] `item_hp` (8x8, 1 frame)
- [ ] `item_mp` (8x8, 1 frame)
- [ ] `item_heart` (8x8, 1 frame)
- [ ] `item_crystal` (8x8, 1 frame)
- [ ] `item_chest` (16x16, 1 frame)
- [ ] `item_chest_relic` (16x16, 1 frame)
- [ ] `shrine_haste` (16x16, 1 frame)
- [ ] `shrine_mana` (16x16, 1 frame)
- [ ] `shrine_damage` (16x16, 1 frame)

## 07 Spell Icons

- [ ] `icon_fireball` (16x16, 1 frame)
- [ ] `icon_frost_spike` (16x16, 1 frame)
- [ ] `icon_tesla_bolt` (16x16, 1 frame)
- [ ] `icon_aether_dash` (16x16, 1 frame)
- [ ] `icon_void_pull` (16x16, 1 frame)
- [ ] `icon_chrono_shift` (16x16, 1 frame)
- [ ] `icon_flame_wave` (16x16, 1 frame)
- [ ] `icon_blizzard_orb` (16x16, 1 frame)
- [ ] `icon_volt_shield` (16x16, 1 frame)
- [ ] `icon_meteor_strike` (16x16, 1 frame)
- [ ] `icon_ice_nova` (16x16, 1 frame)
- [ ] `icon_storm_call` (16x16, 1 frame)
- [ ] `icon_shadow_blink` (16x16, 1 frame)

## 08 UI / Utility Icons

- [ ] `icon_lock` (16x16, 1 frame)
- [ ] `icon_key` (16x16, 1 frame)
- [ ] `icon_book` (16x16, 1 frame)
- [ ] `icon_satchel` (16x16, 1 frame)
- [ ] `icon_trophy` (16x16, 1 frame)
- [ ] `icon_sword` (16x16, 1 frame)
- [ ] `icon_tree` (16x16, 1 frame)
- [ ] `icon_warning` (16x16, 1 frame)
- [ ] `icon_search` (16x16, 1 frame)
- [ ] `icon_time_warp` (16x16, 1 frame)

## 09 Relics

- [ ] `relic_fire` (8x8, 1 frame)
- [ ] `relic_frost` (8x8, 1 frame)
- [ ] `relic_lightning` (8x8, 1 frame)
- [ ] `relic_void` (8x8, 1 frame)
- [ ] `relic_time` (8x8, 1 frame)
- [ ] `relic_boots` (8x8, 1 frame)
- [ ] `relic_shield` (8x8, 1 frame)
- [ ] `relic_heart` (8x8, 1 frame)
- [ ] `relic_mana` (8x8, 1 frame)
- [ ] `relic_regen` (8x8, 1 frame)
- [ ] `relic_crit` (8x8, 1 frame)
- [ ] `relic_cast` (8x8, 1 frame)
- [ ] `relic_alldmg` (8x8, 1 frame)
- [ ] `relic_mpregen` (8x8, 1 frame)
- [ ] `relic_xp` (8x8, 1 frame)

## 10 Equipment

- [ ] `equip_wand_novice` (8x8, 1 frame)
- [ ] `equip_staff_fire` (8x8, 1 frame)
- [ ] `equip_wand_mana` (8x8, 1 frame)
- [ ] `equip_hood_apprentice` (8x8, 1 frame)
- [ ] `equip_crown_mage` (8x8, 1 frame)
- [ ] `equip_robe_student` (8x8, 1 frame)
- [ ] `equip_robe_runic` (8x8, 1 frame)
- [ ] `equip_boots_leather` (8x8, 1 frame)
- [ ] `equip_boots_wizard` (8x8, 1 frame)
- [ ] `equip_ring_gold` (8x8, 1 frame)
- [ ] `equip_ring_crit` (8x8, 1 frame)

## Notes

- Keep the sprites pixel-perfect and avoid anti-aliasing.
- The `AssetManager` is the source of truth for sprite keys.
- If you add or rename textures later, update this checklist alongside `src/engine/AssetManager.js`.
