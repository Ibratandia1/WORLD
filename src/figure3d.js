// Personnages 3D (ville et intérieurs) : un seul maillage par personne (1 appel de dessin), plusieurs poses
// pré-calculées : debout, 4 temps de marche (bras et jambes qui se balancent), assis. On change de géométrie
// pour animer. Hauteur 1 (on met à l'échelle avec mesh.scale). Couleurs = l'apparence du personnage (look.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WALK_FRAMES = 6;
const C = new THREE.Color();
function paint(geo, color) {
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  const n = geo.attributes.position.count, cols = new Float32Array(n * 3);
  C.set(color ?? 0x888888);
  for (let i = 0; i < n; i++) { cols[i * 3] = C.r; cols[i * 3 + 1] = C.g; cols[i * 3 + 2] = C.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}
const sph = (r, x, y, z, ws = 8, hs = 6) => new THREE.SphereGeometry(r, ws, hs).translate(x, y, z);
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (r1, r2, h, x, y, z, s = 7) => new THREE.CylinderGeometry(r1, r2, h, s).translate(x, y, z);
const darker = (c, k = 0.75) => { const o = new THREE.Color(c ?? 0x888888); o.multiplyScalar(k); return o.getHex(); };
const BUILD = { mince: 0.86, normal: 1, fort: 1.2 };

// Membre articulé : construit vers le bas depuis le pivot (0,0,0), tourné de `ang` autour de l'axe x, posé en (x, y, z)
function limb(parts, ang, x, y, z) {
  const g = mergeGeometries(parts);
  g.rotateX(ang); g.translate(x, y, z);
  return g;
}

function build(look, pose, k) {
  const L = look || {};
  const bw = BUILD[L.build] || 1;
  const skin = L.skin ?? 0xf1c7a3, body = L.body ?? 0x5b8def, legs = L.legs ?? 0x3a4766, hair = L.hairColor ?? 0x2b1d16;
  const out = [];
  const dress = L.outfit === 'robe', suit = L.outfit === 'costume';
  const top = suit ? 0x2b2f3a : body, bottom = suit ? 0x2b2f3a : legs;
  // Angles : marche (jambes et bras opposés), assis (cuisses à l'horizontale)
  const sw = pose === 'walk' ? Math.sin((k / WALK_FRAMES) * Math.PI * 2) * 0.55 : 0;
  const sit = pose === 'sit';
  // --- Jambes (pivot à la hanche) + chaussures ---
  const hipY = 0.46;
  for (const side of [-1, 1]) {
    const a = sit ? -1.45 : sw * side;
    const leg = [paint(cyl(0.047, 0.04, 0.4, 0, -0.2, 0), dress && !sit ? skin : bottom), paint(box(0.075, 0.045, 0.13, 0, -0.415, 0.025), 0x2a2a30)];
    out.push(limb(leg, a, side * 0.055 * bw, hipY, 0));
  }
  // --- Bassin, buste (tenue), robe ---
  out.push(paint(box(0.2 * bw, 0.09, 0.13, 0, hipY, 0), dress ? body : bottom));
  out.push(paint(new THREE.CapsuleGeometry(0.1 * bw, 0.17, 3, 8).scale(1, 1, 0.72).translate(0, 0.63, 0), top));
  if (dress) out.push(paint(new THREE.ConeGeometry(0.17 * bw, 0.26, 10, 1, true).translate(0, 0.42, 0), body));
  if (L.outfit === 'mariniere') for (let i = 0; i < 4; i++) out.push(paint(cyl(0.103 * bw, 0.103 * bw, 0.022, 0, 0.56 + i * 0.05, 0, 10).scale(1, 1, 0.74), 0x1f2f5e));
  if (suit) { out.push(paint(box(0.05, 0.16, 0.01, 0, 0.66, 0.075), 0xffffff)); out.push(paint(box(0.022, 0.13, 0.012, 0, 0.65, 0.08), 0xc9453f)); }
  if (L.outfit === 'veste') out.push(paint(box(0.04, 0.2, 0.012, 0, 0.64, 0.074), darker(body, 0.6)));
  if (L.outfit === 'sweat') out.push(paint(sph(0.07, 0, 0.76, -0.07, 8, 5).scale(1.3, 0.6, 1), darker(body, 0.85))); // capuche
  if (L.accessory === 'echarpe') out.push(paint(cyl(0.065, 0.075, 0.05, 0, 0.79, 0, 10), 0xd8504d));
  // --- Bras (pivot à l'épaule) + mains ---
  for (const side of [-1, 1]) {
    const a = sit ? -0.5 : -sw * side * 0.8;
    const arm = [paint(cyl(0.032, 0.028, 0.27, 0, -0.135, 0), top), paint(sph(0.032, 0, -0.285, 0, 6, 5), skin)];
    out.push(limb(arm, a, side * (0.13 * bw + 0.012), 0.76, 0));
  }
  // --- Cou, tête, visage ---
  out.push(paint(cyl(0.035, 0.04, 0.06, 0, 0.8, 0), skin));
  const hy = 0.9;
  out.push(paint(sph(0.1, 0, hy, 0, 12, 9), skin));
  for (const s of [-1, 1]) {
    out.push(paint(sph(0.016, s * 0.036, hy + 0.01, 0.088, 6, 5), 0x1d1b22));            // yeux
    out.push(paint(box(0.032, 0.008, 0.01, s * 0.036, hy + 0.045, 0.09), darker(hair, 0.9))); // sourcils
    out.push(paint(sph(0.022, s * 0.1, hy, 0, 6, 5).scale(0.5, 1, 1), skin));           // oreilles
  }
  out.push(paint(sph(0.016, 0, hy - 0.022, 0.098, 6, 5), darker(skin, 0.9)));            // nez
  out.push(paint(box(0.04, 0.008, 0.01, 0, hy - 0.055, 0.088), 0xb5605a));               // bouche
  if (L.accessory === 'moustache') out.push(paint(box(0.06, 0.014, 0.012, 0, hy - 0.04, 0.094), darker(hair, 0.9)));
  if (L.accessory === 'lunettes' || L.accessory === 'solaires') {
    const c = L.accessory === 'solaires' ? 0x111111 : 0x333333;
    for (const s of [-1, 1]) out.push(paint(box(0.04, 0.03, 0.008, s * 0.037, hy + 0.01, 0.1), L.accessory === 'solaires' ? 0x111111 : 0x9fc4e8));
    out.push(paint(box(0.11, 0.008, 0.008, 0, hy + 0.024, 0.101), c));
  }
  // --- Coiffure ---
  const cap = (r = 0.106, cut = Math.PI / 2) => new THREE.SphereGeometry(r, 12, 7, 0, Math.PI * 2, 0, cut);
  const st = L.hairStyle || 'court';
  if (st !== 'chauve') {
    if (st === 'afro') out.push(paint(sph(0.145, 0, hy + 0.04, -0.02, 10, 8), hair));
    else if (st === 'casquette') {
      out.push(paint(cap(0.108).translate(0, hy + 0.01, 0), 0x2b3245));
      out.push(paint(box(0.13, 0.012, 0.09, 0, hy + 0.03, 0.11), 0x2b3245));
    } else {
      out.push(paint(cap(0.108, Math.PI * 0.55).rotateX(-0.25).translate(0, hy + 0.005, -0.008), hair));
      if (st === 'long') out.push(paint(box(0.19, 0.22, 0.05, 0, hy - 0.08, -0.07), hair));
      if (st === 'carre') { out.push(paint(box(0.21, 0.12, 0.17, 0, hy - 0.02, -0.02), hair)); }
      if (st === 'chignon') out.push(paint(sph(0.05, 0, hy + 0.07, -0.09, 8, 6), hair));
      if (st === 'queue') out.push(paint(new THREE.CapsuleGeometry(0.03, 0.12, 2, 6).translate(0, hy - 0.06, -0.11), hair));
      if (st === 'tresses') for (const s of [-1, 1]) out.push(paint(cyl(0.022, 0.018, 0.2, s * 0.08, hy - 0.12, -0.03), hair));
      if (st === 'crete') out.push(paint(box(0.03, 0.06, 0.18, 0, hy + 0.11, -0.01), hair));
      if (st === 'boucles') for (const [x, z] of [[-0.06, 0.03], [0.06, 0.03], [0, -0.05], [-0.07, -0.05], [0.07, -0.05], [0, 0.06]]) out.push(paint(sph(0.04, x, hy + 0.07, z, 6, 5), hair));
    }
  }
  if (L.hat === 'beret') out.push(paint(cyl(0.11, 0.1, 0.035, 0.015, hy + 0.1, 0, 12), 0x2b2b33));
  if (L.hat === 'chapeau') { out.push(paint(cyl(0.16, 0.16, 0.012, 0, hy + 0.07, 0, 14), 0x222228)); out.push(paint(cyl(0.085, 0.09, 0.09, 0, hy + 0.12, 0, 12), 0x222228)); out.push(paint(cyl(0.091, 0.091, 0.02, 0, hy + 0.09, 0, 12), 0xb8403e)); }
  const g = mergeGeometries(out);
  if (sit) g.translate(0, -0.2, 0.08); // assis : le bassin descend au niveau du siège
  g.computeBoundingSphere();
  return g;
}

// Poses d'un personnage, créées à la demande et partagées entre ceux qui se ressemblent
const cache = new Map();
const keyOf = L => L ? [L.skin, L.body, L.legs, L.hairColor, L.hairStyle, L.build, L.outfit, L.hat, L.accessory].join('|') : '-';
export function figurePose(look, pose = 'stand', k = 0) {
  const key = keyOf(look);
  let f = cache.get(key);
  if (!f) { f = {}; cache.set(key, f); }
  const id = pose === 'walk' ? `walk${k % WALK_FRAMES}` : pose;
  if (!f[id]) f[id] = build(look, pose, k % WALK_FRAMES);
  return f[id];
}
export const FIGURE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 });
