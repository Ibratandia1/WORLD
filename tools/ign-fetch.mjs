// Récupère la BD TOPO® (IGN) d'une zone via le service WFS public de la Géoplateforme (sans compte).
// Usage : node tools/ign-fetch.mjs            → data/ign/*.json
// Licence Ouverte 2.0 — crédit obligatoire : « Source : IGN – BD TOPO® ».
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Zone : le cœur du Marais (rue des Rosiers, rue Vieille-du-Temple, rue des Francs-Bourgeois)
export const AREA = { south: 48.8549, west: 2.3548, north: 48.8592, east: 2.3622 };

const LAYERS = {
  batiment: 'BDTOPO_V3:batiment',
  route: 'BDTOPO_V3:troncon_de_route',
  vegetation: 'BDTOPO_V3:zone_de_vegetation',
  eau: 'BDTOPO_V3:surface_hydrographique',
};

const url = type => 'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature'
  + `&TYPENAMES=${type}&COUNT=5000&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326`
  + `&BBOX=${AREA.south},${AREA.west},${AREA.north},${AREA.east},urn:ogc:def:crs:EPSG::4326`;

// Téléchargement seulement quand on lance ce fichier (pas quand un autre script importe AREA)
const main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (main) mkdirSync('data/ign', { recursive: true });
for (const [name, type] of main ? Object.entries(LAYERS) : []) {
  const res = await fetch(url(type));
  if (!res.ok) { console.log(name, 'erreur', res.status); continue; }
  const json = await res.json();
  writeFileSync(`data/ign/${name}.json`, JSON.stringify(json));
  console.log(name, json.features.length, 'objets');
}
