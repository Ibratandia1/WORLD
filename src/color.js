// Assombrit (f < 1) ou éclaircit (f > 1) une couleur 0xRRGGBB.
export function shade(c, f) {
  const ch = s => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export const hex = c => '#' + c.toString(16).padStart(6, '0');
