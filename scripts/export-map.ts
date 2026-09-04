import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { BattleGame } from '../lib/game/engine.ts';
const game = Object.create(BattleGame.prototype) as BattleGame;
Object.assign(game, {
  world: new THREE.Group(),
  scene: new THREE.Scene(),
  colliders: [],
  solids: [],
  loot: [],
});
game.buildWorld();
writeFileSync(
  new URL('../lib/game/map-data.ts', import.meta.url),
  '// Generated from the rendered island by npm run map:export.\nexport const MAP = ' +
    JSON.stringify({
      colliders: game.colliders.map((b) => ({
        min: b.min.toArray(),
        max: b.max.toArray(),
      })),
      loot: game.loot.map((l) => ({
        x: l.mesh.position.x,
        z: l.mesh.position.z,
        kind: l.kind,
      })),
    }) +
    ';\n',
);
game.disposeObject(game.world);
