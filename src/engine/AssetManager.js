/**
 * AssetManager - Procedural Pixel Art Generator
 * Generates and caches retro pixel-art sprites using offscreen canvases.
 */
export class AssetManager {
  constructor() {
    this.sprites = {};
    this.palette = {
      '.': 'transparent',
      'k': '#10121a', // Dark Outline / Black
      'w': '#ffffff', // White
      's': '#a4b0be', // Silver / Gray
      'a': '#57606f', // Dark Gray
      'p': '#fed330', // Skin Tone (Amber/Gold Wizard Mask)
      'b': '#3867d6', // Player Robe Blue
      'd': '#25438c', // Player Robe Dark Blue
      'r': '#ff4757', // Fire Red
      'o': '#ffa502', // Fire Orange
      'f': '#2ed573', // Slime Green
      'e': '#26af5f', // Dark Slime Green
      'c': '#10ac84', // Frost Teal/Cyan
      'i': '#70a1ff', // Ice Light Blue
      'y': '#f1c40f', // Lightning Yellow
      'v': '#a55eea', // Void Purple
      'x': '#8854d0', // Dark Void Purple
      't': '#ff9f43', // Time Orange/Amber
      'g': '#eccc68', // Gold
    };

    this.generateAssets();
  }

  /**
   * Helper to parse string array grids and draw to an offscreen canvas
   */
  createSprite(width, height, grid, frames = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width * frames;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (let f = 0; f < frames; f++) {
      const frameGrid = grid[f] || grid[0];
      const offsetX = f * width;
      
      for (let y = 0; y < height; y++) {
        const row = frameGrid[y] || "";
        for (let x = 0; x < width; x++) {
          const char = row[x] || '.';
          const color = this.palette[char];
          if (color && color !== 'transparent') {
            ctx.fillStyle = color;
            ctx.fillRect(offsetX + x, y, 1, 1);
          }
        }
      }
    }
    return canvas;
  }

  generateAssets() {
    // ----------------------------------------------------
    // PLAYER SPRITES (16x16 px)
    // Frame 0: Idle, Frame 1-2: Walk Animation
    // ----------------------------------------------------
    const playerGrid = [
      // Frame 0 (Idle)
      [
        "....kkkkkk......",
        "...kbbbbbbk.....",
        "..kbbdppdbbk....",
        "..kbddppddbk....",
        "..kbbdppdbbk....",
        "...kbbbbbbk.....",
        "...ksskkssk.....",
        "..kbbskkbsbk....",
        ".kbbbskkbsbbk...",
        "kbbbbskkbsbbbk..",
        "kbbbbskkbsbbbk..",
        "kkbbbskkbsbbkk..",
        ".kbbbskkbsbbk...",
        "..kbbskkbsbk....",
        "...kkakkakk.....",
        "....kk..kk......"
      ],
      // Frame 1 (Walk A)
      [
        "....kkkkkk......",
        "...kbbbbbbk.....",
        "..kbbdppdbbk....",
        "..kbddppddbk....",
        "..kbbdppdbbk....",
        "...kbbbbbbk.....",
        "...ksskkssk.....",
        "..kbbskkbsbk....",
        ".kbbbskkbsbbk...",
        "kbbbbskkbsbbbk..",
        "kbbbbskkbsbbbk..",
        "kkbbkkkkkkbbkk..",
        ".kbbk....kbbk...",
        "..kk......kk....",
        "...kk.....kk....",
        "....k......k...."
      ],
      // Frame 2 (Walk B)
      [
        "....kkkkkk......",
        "...kbbbbbbk.....",
        "..kbbdppdbbk....",
        "..kbddppddbk....",
        "..kbbdppdbbk....",
        "...kbbbbbbk.....",
        "...ksskkssk.....",
        "..kbbskkbsbk....",
        ".kbbbskkbsbbk...",
        "kbbbbskkbsbbbk..",
        "kbbbbskkbsbbbk..",
        "kkbbbskkbsbbkk..",
        ".kbbk....kbbk...",
        "..kkkk..kkkk....",
        "....kk..kk......",
        "....k....k......"
      ]
    ];
    this.sprites['player'] = this.createSprite(16, 16, playerGrid, 3);

    // ----------------------------------------------------
    // ENEMY: SLIME (16x16 px)
    // ----------------------------------------------------
    const slimeGrid = [
      // Frame 0
      [
        "................",
        "................",
        "................",
        "......kkkk......",
        "....kkffeedk....",
        "...kffffeedddk..",
        "..kffffffeedddk.",
        ".kffffwffwfeeddk",
        ".kffffkffkfeeddk",
        "kffffffeeddddddk",
        "kffffffeeddddddk",
        "kffffffeeddddddk",
        "kffffffeeddddddk",
        "kffffffeeddddddk",
        ".kkffffeeddddk..",
        "...kkkkkkkkkk..."
      ],
      // Frame 1 (squashed)
      [
        "................",
        "................",
        "................",
        "................",
        "......kkkk......",
        "....kkffeedk....",
        "...kffffeedddk..",
        "..kffffwffwfeedk",
        ".kffffkffkfeeddk",
        ".kfffffeeedddddk",
        "kffffffeeddddddk",
        "kffffffeeddddddk",
        "kffffffeeddddddk",
        "kkffffeedddddkk.",
        ".kkffffeeddddk..",
        "..kkkkkkkkkkkk.."
      ]
    ];
    this.sprites['enemy_slime'] = this.createSprite(16, 16, slimeGrid, 2);

    // ----------------------------------------------------
    // ENEMY: SKELETON (16x16 px)
    // ----------------------------------------------------
    const skeletonGrid = [
      [
        "...kkkkkk.......",
        "..kwwwwwk.......",
        ".kwwwwwwk.......",
        ".kwkkwwkk.......",
        "..kkwwkk........",
        "...kwwk...sk....",
        "...kwwk..sssk...",
        "..kwwwwk.s.s....",
        ".kwwwwwwks.s....",
        "kwwkwwkwwk.s....",
        "kk.kwwk.kk.s....",
        "...kwwk....s....",
        "..kwwkwwk..s....",
        "..kwkkkwk.......",
        "..kk..kk........",
        "..k....k........"
      ],
      [
        "...kkkkkk.......",
        "..kwwwwwk.......",
        ".kwwwwwwk.......",
        ".kwkkwwkk.......",
        "..kkwwkk........",
        "...kwwk...sk....",
        "...kwwk..sssk...",
        "..kwwwwks..s....",
        ".kwwwwwwk..s....",
        "kwwkwwkwwk.s....",
        "kk.kwwk.kk......",
        "...kwwk.........",
        "..kwwkwwk.......",
        "..kwwkwwk.......",
        "..kk...kk.......",
        "..k.....k......."
      ]
    ];
    this.sprites['enemy_skeleton'] = this.createSprite(16, 16, skeletonGrid, 2);

    // ----------------------------------------------------
    // ENEMY: VOID HORROR (16x16 px)
    // ----------------------------------------------------
    const horrorGrid = [
      [
        ".....kkkkkk.....",
        "...kkvvxxvvkk...",
        "..kkvxxxxxxvkk..",
        ".kkvxxwxxwxxvkk.",
        ".kvxxwkxxwkxxvk.",
        "kvxxwkkxxwkkxxvk",
        "kvxxxxxxxxxxxxvk",
        "kvxxxxxxwxxxxxvk",
        "kvxxxxwwwwwxxxvk",
        "kvxxxxwkkkwwxxvk",
        ".kvxxxxxxxxxxvk.",
        ".kkvxxxxxxxxvkk.",
        "..kkvxxxxxxvkk..",
        "...kkvxxxxvkk...",
        "....kkvvvvkk....",
        "......kkkk......"
      ],
      [
        ".....kkkkkk.....",
        "...kkvxvvxvkk...",
        "..kkxxxxxxxxkk..",
        ".kkxwxxwxxwxxkk.",
        ".kxxwkxxwkxxvxk.",
        "kxxxwkkxxwkkxxxk",
        "kxxxxxxxxxxxxxxk",
        "kxxxxxxxxxxxxxxk",
        "kxxxxxwwwwwxxxxk",
        "kxxxxxwkkkwwxxxk",
        ".kxxxxxxxxxxxxk.",
        ".kkxxxxxxxxxkk..",
        "..kkxxxxxxxkk...",
        "...kkxxxxxkk....",
        "....kkvvvkk.....",
        "......kkk......."
      ]
    ];
    this.sprites['enemy_horror'] = this.createSprite(16, 16, horrorGrid, 2);

    // ----------------------------------------------------
    // ENEMY: CHRONO WARDEN (16x16 px)
    // ----------------------------------------------------
    const wardenGrid = [
      [
        ".....kkkkkk.....",
        "....kggggggk....",
        "...kggtyytggk...",
        "..kgttyyyyttgk..",
        "..kgtyywwyyytgk.",
        ".kgtyywwkkwwytgk",
        ".kgtyyyyyyyyytgk",
        ".kkttyyyyyyyttkk",
        "...ksskkkkssk...",
        "..kssssssssssk..",
        ".ksssskkkkssssk.",
        "kssskkkkkkksssk",
        "kkssk.....ksskk",
        ".kk.......kk....",
        ".k.........k....",
        "................"
      ],
      [
        ".....kkkkkk.....",
        "....kggggggk....",
        "...kggtyytggk...",
        "..kgttyyyyttgk..",
        "..kgtyywwyyytgk.",
        ".kgtyywwkkwwytgk",
        ".kgtyyyyyyyyytgk",
        ".kkttyyyyyyyttkk",
        "...ksskkkkssk...",
        "..kssssssssssk..",
        ".ksssskkkkssssk.",
        "kssskkkkkkksssk",
        "kksskk...kksskk",
        ".kk.k.....k.kk..",
        "....k.....k.....",
        "................"
      ]
    ];
    this.sprites['enemy_warden'] = this.createSprite(16, 16, wardenGrid, 2);

    // ----------------------------------------------------
    // BOSS: AETHER ARCHON (32x32 px)
    // ----------------------------------------------------
    const archonGrid = [
      [
        "............kkkkkkkk............",
        "..........kkvvvvvvvvkk..........",
        "........kkvvvvvvvvvvvvkk........",
        ".......kvvvvvvvvvvvvvvvvk.......",
        "......kvvvvvvvvvvvvvvvvvvk......",
        ".....kvvvvwwvvvvvvvvwwvvvvk.....",
        "....kvvvvvwwkkvvvvkkwwvvvvvk....",
        "....kvvvvvvvkkvvvvkkvvvvvvvk....",
        "....kvvvvvvvvvvvvvvvvvvvvvvk....",
        ".....kvvvvvvkkkkkkkkvvvvvvk.....",
        ".....kvvvvvkvvvvvvvvkvvvvvk.....",
        "......kvvvkggkkkkkkggkvvvk......",
        ".......kkkggggggggggggkkk.......",
        ".........kggggggggggggk.........",
        "........kgggggkkgggggggk........",
        ".......kgggggkkkkgggggggk.......",
        "......kgggggkkkkkkgggggggk......",
        ".....kgggggkkkkkkkkgggggggk.....",
        "....kgggggkkkkkkkkkkgggggggk....",
        "...kgggggkkkkkkkkkkkkgggggggk...",
        "..kgggggkkkkkkkkkkkkkkgggggggk..",
        "..kggggkkkkkkkkkkkkkkkkggggggk..",
        "..kkkkkkkkkkkkkkkkkkkkkkkkkkkk..",
        "....kvvvk............kvvvk......",
        "....kvvvk............kvvvk......",
        "....kvvvk............kvvvk......",
        ".....kvk..............kvk.......",
        ".....kvk..............kvk.......",
        "......kk..............kk........",
        "......kk..............kk........",
        "......k................k........",
        "................................"
      ]
    ];
    this.sprites['boss_archon'] = this.createSprite(32, 32, archonGrid, 1);

    // ----------------------------------------------------
    // PROJECTILES & SPELL EFFECTS (8x8 px)
    // ----------------------------------------------------
    // Fireball
    this.sprites['proj_fire'] = this.createSprite(8, 8, [[
      "..kk....",
      ".krrk...",
      "krrork..",
      "kroookk.",
      "kroookk.",
      "krrork..",
      ".krrk...",
      "..kk...."
    ]]);
    
    // Frost Spike
    this.sprites['proj_frost'] = this.createSprite(8, 8, [[
      "...cc...",
      "..cicc..",
      ".ciiicc.",
      ".ciiicc.",
      "ciiiiicc",
      ".ciiicc.",
      "..ccc...",
      "...c...."
    ]]);

    // Lightning Spark
    this.sprites['proj_lightning'] = this.createSprite(8, 8, [[
      "....y...",
      "...yy...",
      "..yyy...",
      ".yyyyy..",
      "..yyy...",
      "...yy...",
      "....y...",
      "........"
    ]]);

    // Void Orb
    this.sprites['proj_void'] = this.createSprite(8, 8, [[
      "..kkk...",
      ".kvvxk..",
      "kvxxvxk.",
      "kvxxxxk.",
      "kvxxxxk.",
      "kvxxvxk.",
      ".kvvxk..",
      "..kkk..."
    ]]);

    // ----------------------------------------------------
    // AETHER SHARD ITEM (8x8 px)
    // ----------------------------------------------------
    this.sprites['item_shard'] = this.createSprite(8, 8, [[
      "...w....",
      "..wcw...",
      ".wcccw..",
      "wcccccw.",
      ".wcccw..",
      "..wcw...",
      "...w....",
      "........"
    ]]);

    // ----------------------------------------------------
    // Potions (8x8 px)
    // ----------------------------------------------------
    this.sprites['item_hp'] = this.createSprite(8, 8, [[
      "...kk...",
      "..kwwk..",
      ".ksrrsk.",
      "krrrrrrk",
      "krrrrrrk",
      "ksrrrrsk",
      ".kkkkkk.",
      "........"
    ]]);

    this.sprites['item_mp'] = this.createSprite(8, 8, [[
      "...kk...",
      "..kwwk..",
      ".ksbbsk.",
      "kbbbbbbk",
      "kbbbbbbk",
      "ksbbbbsk",
      ".kkkkkk.",
      "........"
    ]]);

    // ----------------------------------------------------
    // Heart and Crystal Upgrades (8x8 px)
    // ----------------------------------------------------
    this.sprites['item_heart'] = this.createSprite(8, 8, [[
      ".kk.kk..",
      "krrkrrk.",
      "krrrrok.",
      "krooook.",
      ".kroook.",
      "..kok...",
      "...k....",
      "........"
    ]]);

    this.sprites['item_crystal'] = this.createSprite(8, 8, [[
      "...kk...",
      "..kwwk..",
      ".kiiciik.",
      "kiiiciik",
      ".kiiciik.",
      "..kcck..",
      "...kk...",
      "........"
    ]]);

    // ----------------------------------------------------
    // Interactive Chest (16x16 px)
    // ----------------------------------------------------
    this.sprites['item_chest'] = this.createSprite(16, 16, [[
      "................",
      "....kkkkkkkk....",
      "...kooooooook...",
      "..koooggggoook..",
      ".kooogkkkkgoook.",
      ".kkkkkkkkkkkkkk.",
      ".ksksksgksksksk.",
      ".kaaaaaagaaaaak.",
      ".kaaaaaagaaaaak.",
      ".kaaaaaagaaaaak.",
      ".kaaaaaagaaaaak.",
      ".kkkkkkkkkkkkkk.",
      "................",
      "................",
      "................",
      "................"
    ]]);

    // ----------------------------------------------------
    // Interactive Shrines (16x16 px)
    // ----------------------------------------------------
    // Haste Shrine (Orange Pillar, winged speed)
    this.sprites['shrine_haste'] = this.createSprite(16, 16, [[
      "......kkkk......",
      ".....kttyykk....",
      "....kttyyyykk...",
      "....ktyywwyyk...",
      "....ktyywwyyk...",
      "....ktyyyyyyk...",
      "....ksssssssk...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "...kkaaaaaaakk..",
      "..kkkkkkkkkkkkk."
    ]]);

    // Mana Shrine (Cyan/Blue Pillar, mana crystal)
    this.sprites['shrine_mana'] = this.createSprite(16, 16, [[
      "......kkkk......",
      ".....kiicckk....",
      "....kiiciickk...",
      "....kicwwwcck...",
      "....kicwwwcck...",
      "....kiicccick...",
      "....ksssssssk...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "...kkaaaaaaakk..",
      "..kkkkkkkkkkkkk."
    ]]);

    // Damage Shrine (Red Pillar, fire flame power)
    this.sprites['shrine_damage'] = this.createSprite(16, 16, [[
      "......kkkk......",
      ".....krrookk....",
      "....krroorokk...",
      "....krowwookk...",
      "....krowwookk...",
      "....krrooookk...",
      "....ksssssssk...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "....kaaaaaaak...",
      "...kkaaaaaaakk..",
      "..kkkkkkkkkkkkk."
    ]]);

    // ----------------------------------------------------
    // Orbital Wisp Companion (8x8 px)
    // ----------------------------------------------------
    this.sprites['item_wisp'] = this.createSprite(8, 8, [[
      "..www...",
      ".wwiww..",
      "wiiciiw.",
      "wiciiciw",
      "wiiciiw.",
      ".wwiww..",
      "..www...",
      "........"
    ]]);

    // ----------------------------------------------------
    // Pet / Companion Dragon (16x16 px)
    // ----------------------------------------------------
    const petDragonGrid = [
      // Frame 0: wings down
      [
        "................",
        "......kkkk......",
        ".....krrrok.....",
        "....krrroook....",
        "....krrkkkk.....",
        "...krrrrrrk..k..",
        "..krrrrrrrrkk...",
        "..krorooroork...",
        "..krokkkkkork...",
        "..kk......kk....",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................"
      ],
      // Frame 1: wings up
      [
        "......kkkk......",
        ".....krrrok.....",
        "....krrroook....",
        "....krrkkkk.....",
        "...krrrrrrkkk...",
        "..krrrrrrrrrkk..",
        "..krorooroork...",
        "..krokkkkkork...",
        "..kk......kk....",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................"
      ]
    ];
    this.sprites['pet_dragon'] = this.createSprite(16, 16, petDragonGrid, 2);

    // ----------------------------------------------------
    // Pet / Companion Griffin (16x16 px)
    // ----------------------------------------------------
    const petGriffinGrid = [
      // Frame 0: wings down
      [
        "................",
        "......kkkk......",
        ".....ktttgk.....",
        "....ktttgggk....",
        "....kttkkkk.....",
        "...kttttttk..k..",
        "..kttttttttkk...",
        "..ktgygygygtk...",
        "..ktgkkkkkgtk...",
        "..kk......kk....",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................"
      ],
      // Frame 1: wings up
      [
        "......kkkk......",
        ".....ktttgk.....",
        "....ktttgggk....",
        "....kttkkkk.....",
        "...kttttttkkk...",
        "..kttttttttvkk..",
        "..ktgygygygtk...",
        "..ktgkkkkkgtk...",
        "..kk......kk....",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................"
      ]
    ];
    this.sprites['pet_griffin'] = this.createSprite(16, 16, petGriffinGrid, 2);


    // ----------------------------------------------------
    // Elite Enemies Color Variant Mapping
    // ----------------------------------------------------
    const fireSlimeGrid = slimeGrid.map(frame => 
      frame.map(row => row.replace(/f/g, 'r').replace(/e/g, 'o'))
    );
    this.sprites['enemy_slime_elite'] = this.createSprite(16, 16, fireSlimeGrid, 2);

    const frostSkeletonGrid = skeletonGrid.map(frame =>
      frame.map(row => row.replace(/w/g, 'c').replace(/s/g, 'i'))
    );
    this.sprites['enemy_skeleton_elite'] = this.createSprite(16, 16, frostSkeletonGrid, 2);

    const eliteHorrorGrid = horrorGrid.map(frame =>
      frame.map(row => row.replace(/v/g, 'y').replace(/x/g, 't'))
    );
    this.sprites['enemy_horror_elite'] = this.createSprite(16, 16, eliteHorrorGrid, 2);

    // ----------------------------------------------------
    // Spell Icons (16x16 px)
    // ----------------------------------------------------
    this.sprites['icon_fireball'] = this.createSprite(16, 16, [[
      "kkkkkkkkkkkkkkkk",
      "kssssssssssssssk",
      "ks............sk",
      "ks......kk....sk",
      "ks.....krrk...sk",
      "ks....krrrok..sk",
      "ks....kroook..sk",
      "ks...kroooook.sk",
      "ks...kroooook.sk",
      "ks....kooook..sk",
      "ks.....kkkk...sk",
      "ks............sk",
      "ks............sk",
      "ks............sk",
      "kssssssssssssssk",
      "kkkkkkkkkkkkkkkk"
    ]]);

    this.sprites['icon_frost_spike'] = this.createSprite(16, 16, [[
      "kkkkkkkkkkkkkkkk",
      "kssssssssssssssk",
      "ks............sk",
      "ks......cc....sk",
      "ks.....cicc...sk",
      "ks....ciiicc..sk",
      "ks...ciiiiccc.sk",
      "ks...ciiwiccc.sk",
      "ks....ciiiccc.sk",
      "ks.....ccccc..sk",
      "ks......cc....sk",
      "ks............sk",
      "ks............sk",
      "ks............sk",
      "kssssssssssssssk",
      "kkkkkkkkkkkkkkkk"
    ]]);

    this.sprites['icon_tesla_bolt'] = this.createSprite(16, 16, [[
      "kkkkkkkkkkkkkkkk",
      "kssssssssssssssk",
      "ks............sk",
      "ks......kk....sk",
      "ks.....kyyk...sk",
      "ks....kyyyk...sk",
      "ks...kyyyyk...sk",
      "ks..kyywwyyk..sk",
      "ks...kyyyyk...sk",
      "ks....kyyk....sk",
      "ks.....kk.....sk",
      "ks............sk",
      "ks............sk",
      "ks............sk",
      "kssssssssssssssk",
      "kkkkkkkkkkkkkkkk"
    ]]);

    this.sprites['icon_aether_dash'] = this.createSprite(16, 16, [[
      "kkkkkkkkkkkkkkkk",
      "kssssssssssssssk",
      "ks............sk",
      "ks....kkkkkk..sk",
      "ks...kttttttk.sk",
      "ks....kttttk..sk",
      "ks.....kttk...sk",
      "ks......kk....sk",
      "ks.....kttk...sk",
      "ks....ktyytk..sk",
      "ks...ktyyyytk.sk",
      "ks....kkkkkk..sk",
      "ks............sk",
      "ks............sk",
      "kssssssssssssssk",
      "kkkkkkkkkkkkkkkk"
    ]]);

    this.sprites['icon_void_pull'] = this.createSprite(16, 16, [[
      "kkkkkkkkkkkkkkkk",
      "kssssssssssssssk",
      "ks............sk",
      "ks.....kkk....sk",
      "ks....kvvxk...sk",
      "ks...kvxxxvxk.sk",
      "ks...kvxxxxk..sk",
      "ks...kvxxxxk..sk",
      "ks...kvxxxvxk.sk",
      "ks....kvvxk...sk",
      "ks.....kkk....sk",
      "ks............sk",
      "ks............sk",
      "ks............sk",
      "kssssssssssssssk",
      "kkkkkkkkkkkkkkkk"
    ]]);

    this.sprites['icon_chrono_shift'] = this.createSprite(16, 16, [[
      "kkkkkkkkkkkkkkkk",
      "kssssssssssssssk",
      "ks.....kkk....sk",
      "ks....ktgtkk..sk",
      "ks...ktgwwgtk.sk",
      "ks..ktgwwgggtksk",
      "ks..ktggggggtksk",
      "ks..ktggggggtksk",
      "ks...ktggggtk.sk",
      "ks....ktgtkk..sk",
      "ks.....kkk....sk",
      "ks............sk",
      "ks............sk",
      "ks............sk",
      "kssssssssssssssk",
      "kkkkkkkkkkkkkkkk"
    ]]);

    // New Projectiles
    this.sprites['proj_flame_wave'] = this.createSprite(8, 8, [[
      "..kkkk..",
      ".krrrrok",
      "krrroook",
      "kroooook",
      "kroooook",
      "krrroook",
      ".krrrrok",
      "..kkkk.."
    ]]);

    this.sprites['proj_blizzard_orb'] = this.createSprite(8, 8, [[
      "..kkkk..",
      ".kccccik",
      "kcciiiic",
      "kciiiwic",
      "kciiiwic",
      "kcciiiic",
      ".kccccik",
      "..kkkk.."
    ]]);

    // New Icons
    this.sprites['icon_flame_wave'] = this.createSprite(16, 16, [[
      "kkkkkkkkkkkkkkkk",
      "kssssssssssssssk",
      "ks............sk",
      "ks......kk....sk",
      "ks....kkrrkk..sk",
      "ks...krrroork.sk",
      "ks..kroooorrrk.sk",
      "ks..krooooorrk.sk",
      "ks...kroooork.sk",
      "ks....kkrrkk..sk",
      "ks......kk....sk",
      "ks............sk",
      "ks............sk",
      "ks............sk",
      "kssssssssssssssk",
      "kkkkkkkkkkkkkkkk"
    ]]);

    this.sprites['icon_blizzard_orb'] = this.createSprite(16, 16, [[
      "kkkkkkkkkkkkkkkk",
      "kssssssssssssssk",
      "ks.....kk.....sk",
      "ks....kcck....sk",
      "ks...kcciick..sk",
      "ks..kciiiicck.sk",
      "ks..kciiwiick.sk",
      "ks..kciiiicck.sk",
      "ks...kcciick..sk",
      "ks....kcck....sk",
      "ks.....kk.....sk",
      "ks............sk",
      "ks............sk",
      "ks............sk",
      "kssssssssssssssk",
      "kkkkkkkkkkkkkkkk"
    ]]);

    this.sprites['icon_volt_shield'] = this.createSprite(16, 16, [[
      "kkkkkkkkkkkkkkkk",
      "kssssssssssssssk",
      "ks.....kk.....sk",
      "ks...kkyykk...sk",
      "ks..kyyyyyyk..sk",
      "ks..kyykkkkyk.sk",
      "ks..kyyk..kyk.sk",
      "ks..kyykkkkyk.sk",
      "ks..kyyyyyyk..sk",
      "ks...kkyykk...sk",
      "ks.....kk.....sk",
      "ks............sk",
      "ks............sk",
      "ks............sk",
      "kssssssssssssssk",
      "kkkkkkkkkkkkkkkk"
    ]]);

    // ── New Spell Icons ────────────────────────────────────────────────────

    // Meteor Strike — fiery rock falling diagonally
    this.sprites['icon_meteor_strike'] = this.createSprite(16, 16, [[
      "kkkkkkkkkkkkkkkk",
      "kssssssssssssssk",
      "ks..........ooksk",
      "ks.........rooksk",
      "ks........rroooksk",
      "ks.......orrooksk",
      "ks......krroosk.sk",
      "ks.....krroook..sk",
      "ks....koroorok..sk",
      "ks...koroooork..sk",
      "ks....kooooork..sk",
      "ks.....kooork...sk",
      "ks......kkkk....sk",
      "ks..............sk",
      "kssssssssssssssk",
      "kkkkkkkkkkkkkkkk"
    ]]);

    // Ice Nova — ring of frost spikes radiating outward
    this.sprites['icon_ice_nova'] = this.createSprite(16, 16, [[
      "kkkkkkkkkkkkkkkk",
      "kssssssssssssssk",
      "ks....c..c....sk",
      "ks...ccc.ccc..sk",
      "ks..cc.ccc.cc.sk",
      "ks.c...ccc...csk",
      "ks....ccicc...sk",
      "ksc..cciiccc..ck",
      "ks....ccicc...sk",
      "ks.c...ccc...csk",
      "ks..cc.ccc.cc.sk",
      "ks...ccc.ccc..sk",
      "ks....c..c....sk",
      "ks............sk",
      "kssssssssssssssk",
      "kkkkkkkkkkkkkkkk"
    ]]);

    // Storm Call — lightning bolt raining from a cloud
    this.sprites['icon_storm_call'] = this.createSprite(16, 16, [[
      "kkkkkkkkkkkkkkkk",
      "kssssssssssssssk",
      "ks....kkkkk...sk",
      "ks...kssssssk.sk",
      "ks..kssssssssk.sk",
      "ks..ksssssssssk",
      "ks...kkkkkkkk.sk",
      "ks.....kyyk...sk",
      "ks....kyyyk...sk",
      "ks...kyyyyyy..sk",
      "ks....kyyk....sk",
      "ks....kyyk....sk",
      "ks.....kk.....sk",
      "ks............sk",
      "kssssssssssssssk",
      "kkkkkkkkkkkkkkkk"
    ]]);

    // Shadow Blink — void eye with motion lines
    this.sprites['icon_shadow_blink'] = this.createSprite(16, 16, [[
      "kkkkkkkkkkkkkkkk",
      "kssssssssssssssk",
      "ks............sk",
      "ks....kkkkk...sk",
      "ks...kvvvxk...sk",
      "ks..kvxvvxxk..sk",
      "ks..kvxwvxvk..sk",
      "ks..kvxvvxxk..sk",
      "ks...kvvvxk...sk",
      "ks....kkkkk...sk",
      "ks..v........vsk",
      "ks.vv.......vvsk",
      "ks............sk",
      "ks............sk",
      "kssssssssssssssk",
      "kkkkkkkkkkkkkkkk"
    ]]);

    // Time Warp — hourglass / clock reset symbol
    this.sprites['icon_time_warp'] = this.createSprite(16, 16, [[
      "kkkkkkkkkkkkkkkk",
      "kssssssssssssssk",
      "ks....kkkkkk..sk",
      "ks...kttttttksk",
      "ks....kttttkk.sk",
      "ks.....kttk...sk",
      "ks.....kttk...sk",
      "ks....kttttk..sk",
      "ks...kttggttk.sk",
      "ks....kttttk..sk",
      "ks.....kttk...sk",
      "ks....kkkkkk..sk",
      "ks............sk",
      "ks............sk",
      "kssssssssssssssk",
      "kkkkkkkkkkkkkkkk"
    ]]);

    // Relics Sprites
    this.sprites['relic_feather'] = this.createSprite(8, 8, [[
      "....kk..",
      "...krrk.",
      "..krrk..",
      ".krrk...",
      ".kok....",
      "krrk....",
      "kk......",
      "........"
    ]]);

    this.sprites['relic_core'] = this.createSprite(8, 8, [[
      "...kk...",
      "..kcck..",
      ".kciick.",
      "kciiwick",
      ".kciick.",
      "..kcck..",
      "...kk...",
      "........"
    ]]);

    this.sprites['relic_ring'] = this.createSprite(8, 8, [[
      "..kkkk..",
      ".kyyyyk.",
      "kyywwyyk",
      "kyw..wyk",
      "kyw..wyk",
      "kyywwyyk",
      ".kyyyyk.",
      "..kkkk.."
    ]]);

    this.sprites['relic_boots'] = this.createSprite(8, 8, [[
      "..kkkk..",
      ".kttttk.",
      ".ktkk...",
      "kkttkk..",
      "ktttttk.",
      "kkkkkkk.",
      "........",
      "........"
    ]]);

    this.sprites['relic_shield'] = this.createSprite(8, 8, [[
      ".kkkkkk.",
      "kssssssk",
      "kssssssk",
      "kasssask",
      ".kasask.",
      ".kassak.",
      "..kak...",
      "...k...."
    ]]);

    this.sprites['relic_amulet'] = this.createSprite(8, 8, [[
      "..kkkk..",
      ".kgggk.",
      "kggbbgk.",
      "kgbibgk.",
      ".kgggk.",
      "..kgk...",
      "...k....",
      "........"
    ]]);

    this.sprites['equip_wand'] = this.createSprite(8, 8, [[
      "......kk",
      ".....kyy",
      "....kyyk",
      "...kskk.",
      "..ksk...",
      ".ksk....",
      "kkk.....",
      "........"
    ]]);

    this.sprites['equip_staff'] = this.createSprite(8, 8, [[
      "....kkk.",
      "...krrro",
      "....kkko",
      "...ksk..",
      "..ksk...",
      ".ksk....",
      "ksk.....",
      "kk......"
    ]]);

    this.sprites['equip_hat'] = this.createSprite(8, 8, [[
      "....k...",
      "...kbk..",
      "..kbbk..",
      ".kbbbbk.",
      "kkkkkkkk",
      ".ksggsk.",
      "........",
      "........"
    ]]);

    this.sprites['equip_robe'] = this.createSprite(8, 8, [[
      "..kkkk..",
      ".kbwwbk.",
      "kbbbbbbk",
      "kbbbbbbk",
      "kbbbbbbk",
      ".kbbbbk.",
      "..kkkk..",
      "........"
    ]]);

    this.sprites['equip_boots'] = this.createSprite(8, 8, [[
      "........",
      "..kkkk..",
      ".kssssk.",
      ".kskk...",
      "kksskk..",
      "ksssssk.",
      "kkkkkkk.",
      "........"
    ]]);

    this.sprites['item_chest_relic'] = this.createSprite(16, 16, [[
      "................",
      "....kkkkkkkk....",
      "...kooooooook...",
      "..kooovvvvoook..",
      ".kooovkkkkvoook.",
      ".kkkkkkkkkkkkkk.",
      ".ksksksvksksksk.",
      ".kaaaaaagaaaaak.",
      ".kaaaaaagaaaaak.",
      ".kaaaaaagaaaaak.",
      ".kaaaaaagaaaaak.",
      ".kkkkkkkkkkkkkk.",
      "................",
      "................",
      "................",
      "................"
    ]]);
  }

  /**
   * Draw a sprite scaled up crisp (nearest neighbor)
   */
  draw(ctx, key, x, y, size = 32, frameIndex = 0, angle = 0, alpha = 1) {
    const sprite = this.sprites[key];
    if (!sprite) return;

    const framesCount = sprite.width / sprite.height;
    const fIndex = Math.floor(frameIndex) % framesCount;
    const sh = sprite.height;
    const sw = sh; // sprites are square
    const sx = fIndex * sw;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    
    // Draw centered on position
    ctx.drawImage(
      sprite,
      sx, 0, sw, sh,
      -size / 2, -size / 2, size, size
    );
    
    ctx.restore();
  }
}
