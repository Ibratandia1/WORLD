// Page de démo : la simulation tourne ici, rendu 3D de src/city3d.js
import { QUARTIER } from './map/quartier.js';
import { parseMap } from './map/parse.js';
import { World } from './sim/world.js';
import { spawnPeople } from './sim/people.js';
import { CityLife } from './sim/city.js';
import { Government } from './sim/gov.js';
import { Safety } from './sim/safety.js';
import { Justice } from './sim/justice.js';
import { Bank } from './sim/bank.js';
import { Festivals } from './sim/festivals.js';
import { startCity3D } from './city3d.js';

const world = new World(parseMap(QUARTIER));
const me = spawnPeople(world, null);
new CityLife(world); new Government(world); new Safety(world); new Justice(world); new Bank(world);
new Festivals(world);
me.controller = 'ai'; me.demoMe = true; // dans la démo, tout le monde vit sa vie (toi aussi)
while (world.hour < 8) world.step(1);
window.world = world;
startCity3D(world, { demo: true });