// Contrôles tactiles communs aux scènes : glisser pour bouger, pincer/molette pour zoomer, toucher.
// La scène doit fournir setZoom(z).
export function attachControls(scene, onTap) {
  const cam = scene.cameras.main;
  const inp = scene.input;
  let down = null;
  let pinch = null;

  inp.on('pointerdown', p => {
    if (inp.pointer1.isDown && inp.pointer2.isDown) {
      pinch = { d: Phaser.Math.Distance.BetweenPoints(inp.pointer1, inp.pointer2), zoom: cam.zoom };
      return;
    }
    down = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY, dragging: false };
  });

  inp.on('pointermove', p => {
    if (pinch && inp.pointer1.isDown && inp.pointer2.isDown) {
      const d = Phaser.Math.Distance.BetweenPoints(inp.pointer1, inp.pointer2);
      scene.setZoom(pinch.zoom * d / pinch.d);
      return;
    }
    if (!down || !p.isDown) return;
    const dx = p.x - down.x, dy = p.y - down.y;
    if (!down.dragging && Math.hypot(dx, dy) > 8) down.dragging = true;
    if (down.dragging) {
      cam.scrollX = down.sx - dx / cam.zoom;
      cam.scrollY = down.sy - dy / cam.zoom;
    }
  });

  inp.on('pointerup', p => {
    if (pinch) {
      // fin du pincement : on continue à glisser avec le doigt restant
      const rest = [inp.pointer1, inp.pointer2].find(q => q.isDown);
      pinch = null;
      down = rest ? { x: rest.x, y: rest.y, sx: cam.scrollX, sy: cam.scrollY, dragging: true } : null;
      return;
    }
    if (down && !down.dragging) onTap(p);
    down = null;
  });

  inp.on('wheel', (p, objs, dx, dy) => scene.setZoom(cam.zoom * (dy > 0 ? 0.9 : 1.1)));
}
