import "./model-preview.css";
import { ColonyScene } from "./engine/colony-scene";
import { state, showcaseAnnotations } from "./model-preview-state";
const canvas = document.querySelector("canvas")!;
const scene = new ColonyScene(canvas, 20);
let shipFocus = false;
let zoom = 1.15,
  panX = 0,
  panY = 0,
  selected: string | null = null;
function render() {
  const w = innerWidth,
    h = innerHeight,
    tile = Math.min(w / 24, h / 14) * zoom;
  scene.render(
    {
      gridSize: 20,
      tileWidth: tile,
      tileHeight: tile / 2,
      originX: w / 2 + panX,
      originY: shipFocus ? h * .45 - tile / 4 + panY : h * .52 - tile * 5 + panY,
    },
    state,
    null,
    null,
    selected,
    true,
    false,
    shipFocus ? [] : showcaseAnnotations,
  );
}
addEventListener("resize", render);
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    zoom = Math.max(0.65, Math.min(8, zoom - e.deltaY * 0.002));
    render();
  },
  { passive: false },
);
let drag: { x: number; y: number; startX: number; startY: number } | null =
  null;
canvas.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  panX += e.clientX - drag.x;
  panY += e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  render();
});
canvas.addEventListener("pointerup", (e) => {
  if (
    drag &&
    Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 5
  ) {
    selected = scene.buildingAt(e.clientX, e.clientY);
    document.getElementById("selection")!.textContent = selected
      ? selected.toUpperCase()
      : "READ-ONLY SCENE · NO SIMULATION";
    render();
  }
  drag = null;
});
canvas.addEventListener("pointercancel", () => {
  drag = null;
});
render();

document.getElementById("view-all")!.addEventListener("click", () => { shipFocus = false; zoom = 1.15; panX = panY = 0; render(); });
document.getElementById("view-ship")!.addEventListener("click", () => { shipFocus = true; zoom = 5; panX = panY = 0; render(); });
