import * as T from "three";
import "../ui/building-status.css";
import { IsoConfig, GridPoint, sortBackToFront, gridToWorld } from "./iso-math";
import type { ColonyState, BuildingType } from "../simulation/types";
import {
  astronaut,
  buildingModel,
  roverModel,
  landingModel,
  box,
  sphere,
  material,
  palette,
} from "../assets/models/colony-models";

/** Visual-only terrain: it never consumes the simulation generator or blocks routes. */
export function terrainHeight(x: number, z: number): number {
  const ridge =
    0.48 * Math.sin(x * 0.28) * Math.sin(z * 0.24) +
    0.18 * Math.cos(x * 0.61 + z * 0.25);
  return 0.25 + ridge;
}
/** The same perimeter relief is used for the ground and rock foundations. */
export function surfaceHeight(x: number, z: number, size: number): number {
  const outside = Math.max(0, -x, x - size, -z, z - size);
  const craterDistance = Math.hypot(x - (size + 3), z - size * 0.35);
  const crater = craterDistance < 2.4
    ? 0.32 * Math.exp(-Math.pow((craterDistance - 1.7) / 0.35, 2)) -
      0.45 * Math.exp(-craterDistance * craterDistance / 0.8)
    : 0;
  return terrainHeight(x, z) + crater + Math.sin(x * 0.8 + z * 0.4) *
    Math.cos(z * 0.6) * Math.min(1.5, outside * 0.4);
}

const rockGeo = new T.DodecahedronGeometry(1, 0);
export class ColonyScene {
  readonly scene = new T.Scene();
  readonly camera = new T.OrthographicCamera(-20, 20, 20, -20, 0.1, 180);
  readonly renderer: T.WebGLRenderer;
  private ground = new T.Group();
  private entities = new T.Group();
  private overlays = new T.Group();
  private ray = new T.Raycaster();
  private signature = "";
  private width = 1;
  private height = 1;
  private size: number;
  private labels: { position: T.Vector3; text: string; color: string }[] = [];
  private labelLayer: HTMLDivElement;
  private statusLayer: HTMLDivElement;
  private statusBadges = new Map<string, HTMLDivElement>();
  private statusAnchors = new Map<string, T.Vector3>();
  constructor(canvas: HTMLCanvasElement, size: number) {
    this.size = size;
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.scene.background = new T.Color("#211a17");
    this.scene.add(new T.HemisphereLight("#f1e4ce", "#5a352c", 2.3));
    const sun = new T.DirectionalLight("#ffe0b6", 3.6);
    sun.position.set(-8, 20, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -22;
    sun.shadow.normalBias = 0.025;
    sun.shadow.bias = -0.0002;
    sun.target.position.set(size / 2, 0, size / 2);
    this.scene.add(sun, sun.target);
    this.scene.add(this.ground, this.entities, this.overlays);
    this.labelLayer = document.createElement("div");
    this.labelLayer.className = "scene-labels";
    canvas.parentElement!.append(this.labelLayer);
    this.statusLayer = document.createElement("div");
    this.statusLayer.className = "building-status-layer";
    canvas.parentElement!.append(this.statusLayer);
    this.buildTerrain();
  }
  private buildTerrain() {
    const n = this.size;
    const geo = new T.PlaneGeometry(n + 12, n + 12, 128, 128);
    geo.rotateX(-Math.PI / 2);
    geo.translate(n / 2, 0, n / 2);
    const positions = geo.getAttribute("position");
    const colors = [];
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        z = positions.getZ(i);
      const h = surfaceHeight(x, z, n);
      positions.setY(i, h);
      const noise = (Math.sin(x * 31.7 + z * 71.3) * 43758.5) % 1;
      const c = new T.Color("#9d6347").multiplyScalar(
        0.86 + noise * 0.08 + h * 0.12,
      );
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new T.Mesh(
      geo,
      new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    );
    mesh.receiveShadow = true;
    mesh.userData.terrain = true;
    this.ground.add(mesh);
    // Close the terrain perimeter so buried rock bases cannot show underneath
    // the otherwise paper-thin surface when viewed from the board's edge.
    const skirtVertices: number[] = [];
    const steps = 128;
    const edgePoint = (edge: number, t: number) => {
      const v = -6 + (n + 12) * t;
      return edge === 0 ? [-6, v] : edge === 1 ? [v, n + 6] :
        edge === 2 ? [n + 6, n - v] : [n - v, -6];
    };
    for (let edge = 0; edge < 4; edge++) {
      for (let step = 0; step < steps; step++) {
        const [ax, az] = edgePoint(edge, step / steps);
        const [bx, bz] = edgePoint(edge, (step + 1) / steps);
        const ay = surfaceHeight(ax, az, n), by = surfaceHeight(bx, bz, n);
        skirtVertices.push(ax, ay, az, bx, by, bz, ax, -3, az,
          bx, by, bz, bx, -3, bz, ax, -3, az);
      }
    }
    const skirtGeometry = new T.BufferGeometry();
    skirtGeometry.setAttribute("position", new T.Float32BufferAttribute(skirtVertices, 3));
    skirtGeometry.computeVertexNormals();
    const skirt = new T.Mesh(skirtGeometry, new T.MeshStandardMaterial({
      color: "#805039", roughness: 1, side: T.DoubleSide,
    }));
    skirt.receiveShadow = true;
    this.ground.add(skirt);

    // Fine survey lines follow the surface, rather than a flat plane above it.
    const points: T.Vector3[] = [];
    for (let i = 0; i <= n; i++)
      for (let s = 0; s < n * 8; s++) {
        const a = s / 8,
          b = (s + 1) / 8;
        points.push(
          new T.Vector3(i, terrainHeight(i, a) + 0.012, a),
          new T.Vector3(i, terrainHeight(i, b) + 0.012, b),
        );
        points.push(
          new T.Vector3(a, terrainHeight(a, i) + 0.012, i),
          new T.Vector3(b, terrainHeight(b, i) + 0.012, i),
        );
      }
    this.ground.add(
      new T.LineSegments(
        new T.BufferGeometry().setFromPoints(points),
        new T.LineBasicMaterial({
          color: "#d5a17a",
          transparent: true,
          opacity: 0.17,
        }),
      ),
    );
    const placed: { x: number; z: number; radius: number }[] = [];
    const landing = gridToWorld(0, 0);
    // Midway between the previous sparse layout (235) and original 340 rocks.
    for (let i = 0; i < 800 && placed.length < 287; i++) {
      const r = (k: number) => {
        const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
        return v - Math.floor(v);
      };
      const x = r(1) * (n + 10) - 5,
        z = r(2) * (n + 10) - 5;
      // Large formations stay outside the buildable survey area.
      const outside = x < 0 || z < 0 || x > n || z > n;
      const scale = outside ? 0.2 + r(3) * 1.1 : 0.015 + r(3) * 0.045;
      const rock = new T.Mesh(
        rockGeo,
        material(i % 3 ? "#80503b" : "#b67a56", 0),
      );
      rock.scale.set(scale, scale * (0.4 + r(4)), scale * 0.8);
      rock.rotation.set(r(5), r(6) * 6, r(7));
      rock.updateMatrix();
      const vertices = rockGeo.getAttribute("position");
      let radius = 0;
      for (let v = 0; v < vertices.count; v++) {
        const point = new T.Vector3().fromBufferAttribute(vertices, v).applyMatrix4(rock.matrix);
        radius = Math.max(radius, Math.hypot(point.x, point.z));
      }
      // Reserve the entire landing approach, not just the pad's center.
      if (Math.hypot(x - landing.x, z - landing.z) < radius + 3.5) continue;
      // Keep the whole rock supported by the terrain, including rotated corners.
      if (x - radius < -5.8 || z - radius < -5.8 ||
          x + radius > n + 5.8 || z + radius > n + 5.8) continue;
      // Large rocks cannot intrude into usable tiles along the perimeter.
      if (outside && x + radius > 0 && z + radius > 0 &&
          x - radius < n && z - radius < n) continue;
      // At most 10% footprint overlap, avoiding merged boulder masses.
      if (placed.some(other => Math.hypot(x - other.x, z - other.z) <
          (radius + other.radius) * 0.9)) continue;
      // Embed the center slightly below the local surface instead of balancing
      // the lowest vertex on the highest patch of a slope. Most of the lower
      // hemisphere is buried, so boulders read as embedded outcrops.
      rock.position.set(x, surfaceHeight(x, z, n) - scale * 0.12, z);
      rock.userData.sceneryRock = { radius };
      placed.push({ x, z, radius });
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.ground.add(rock);
    }
  }
  private at(group: T.Object3D, x: number, y: number, offset = 0) {
    const p = gridToWorld(x, y);
    group.position.set(p.x, terrainHeight(p.x, p.z) + offset, p.z);
    return group;
  }
  private clear(group: T.Group) {
    group.traverse((o) => {
      if (o instanceof T.Mesh && o.material instanceof T.MeshPhysicalMaterial)
        o.material.dispose();
      if (o instanceof T.Line || o instanceof T.Sprite) {
        o.geometry?.dispose();
        if (o.material instanceof T.SpriteMaterial) o.material.map?.dispose();
        o.material.dispose();
      }
    });
    group.clear();
  }
  private rebuild(state: ColonyState) {
    this.clear(this.entities);
    this.labels = [];
    this.statusAnchors.clear();
    for (const b of sortBackToFront(state.buildings)) {
      const active =
        b.condition === "operational" &&
        (b.type === "solar" || state.power > 0) &&
        (b.type === "habitat" ||
          b.type === "garage" ||
          b.type === "solar" ||
          state.colonists.length > 0) &&
        (b.type !== "extractor" ||
          state.oreDeposits.some(
            (d) => d.x === b.x && d.y === b.y && d.remaining > 0,
          ));
      const docked = state.rovers.filter(
        (r) =>
          r.garageX === b.x && r.garageY === b.y && r.state === "idle_at_base",
      ).length;
      const g = buildingModel(b.type, active, docked);
      this.at(g, b.x, b.y, 0.09);
      g.userData.buildingId = b.id;
      if (b.condition === "constructing") {
        g.traverse((o) => {
          if (o instanceof T.Mesh && o.material instanceof T.MeshPhysicalMaterial) {
            o.material.transparent = true;
            o.material.opacity = 0.55;
            o.material.depthWrite = false;
          }
        });
      }
      // A deep foundation seats each facility into sloping terrain.
      box(g, palette.soil, 0, -0.14, 0, 0.94, 0.28, 0.94);
      if (b.condition === "buried")
        sphere(g, palette.soil, 0, 0.15, 0, 0.54, 0.37, 0.53);
      if (active && b.type === "scrubber")
        for (let i = 0; i < 3; i++)
          sphere(
            g,
            "#c7bca6",
            -0.2 + i * 0.04,
            0.87 + i * 0.07,
            0,
            0.04 + i * 0.014,
            0.025,
            0.04,
          );
      this.entities.add(g);
      const bounds = new T.Box3().setFromObject(g);
      this.statusAnchors.set(b.id, new T.Vector3(g.position.x, bounds.max.y + .15, g.position.z));
    }
    for (const [i, c] of state.colonists.entries()) {
      const g = astronaut(c.health, c.age >= c.lifespan * 0.75);
      this.at(g, c.x, c.y, 0.05);
      // Stand outside the facility footprint when resident on an occupied tile.
      if (state.buildings.some((b) => b.x === c.x && b.y === c.y)) {
        g.position.x += 0.43;
        g.position.z += (i % 2 ? 1 : -1) * 0.25;
      }
      if (c.destination)
        g.rotation.y = Math.atan2(c.destination.x - c.x, c.destination.y - c.y);
      this.entities.add(g);
    }
    for (const r of state.rovers) {
      const g = roverModel(
        r.occupants ??
          (r.state === "idle_at_base"
            ? 0
            : r.cargo?.type === "arrival"
              ? 2
              : 1),
      );
      this.at(g, r.x, r.y, 0.08);
      if (r.route.length)
        g.rotation.y = Math.atan2(r.route[0].x - r.x, r.route[0].y - r.y);
      this.entities.add(g);
    }
    const land = landingModel(state.pendingArrivals.length > 0);
    this.at(land, 0, 0, 0.035);
    land.userData.buildingId = "landing_pad";
    this.entities.add(land);
    if (state.pendingArrivals.length) {
      const waitingColonist = astronaut();
      this.at(waitingColonist, 0, 0, 0.04);
      waitingColonist.position.x += 0.36;
      waitingColonist.position.z += 0.3;
      this.entities.add(waitingColonist);
      const a = state.pendingArrivals[0];
      this.labels.push({
        position: land.position.clone().add(new T.Vector3(0, 1.15, 0)),
        text: `ESCORT · ${a.ticksRemaining} TICKS`,
        color: a.ticksRemaining < 30 ? "#E0A030" : "#d9dde0",
      });
    }
    for (const site of state.miningSites) {
      if (site.remaining <= 0) continue;
      const p = gridToWorld(site.x, site.y);
      const marker = new T.Mesh(rockGeo, material("#736b5c", 0.65));
      marker.position.set(p.x, terrainHeight(p.x, p.z) + 0.08, p.z);
      marker.scale.set(0.24, 0.16, 0.21);
      this.entities.add(marker);
    }
    if (state.activeAsteroid) {
      const a = state.activeAsteroid;
      const g = new T.Group();
      const rock = new T.Mesh(rockGeo, material("#3c3a35", 0.7));
      rock.scale.set(0.38, 0.3, 0.4);
      g.add(rock);
      g.userData.asteroid = true;
      this.at(g, a.x, a.y, 0.18);
      this.entities.add(g);
    }
  }
  render(
    config: IsoConfig,
    state: ColonyState,
    hover: GridPoint | null,
    tool: BuildingType | null,
    selected: string | null,
    canPlace: boolean,
    relocating: boolean,
    annotations: { x: number; y: number; text: string }[] = [],
  ) {
    this.width = this.renderer.domElement.clientWidth;
    this.height = this.renderer.domElement.clientHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(this.width, this.height, false);
    const scale = config.tileWidth / Math.SQRT2;
    const elevation = Math.asin(config.tileHeight / config.tileWidth);
    this.camera.position.set(40, Math.tan(elevation) * Math.hypot(40, 40), 40);
    this.camera.lookAt(0, 0, 0);
    this.camera.left = -config.originX / scale;
    this.camera.right = (this.width - config.originX) / scale;
    this.camera.top = config.originY / scale;
    this.camera.bottom = -(this.height - config.originY) / scale;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    const signature = JSON.stringify([
      state.buildings,
      state.colonists,
      state.rovers,
      state.pendingArrivals,
      state.activeAsteroid,
      state.miningSites,
      state.oreDeposits,
      state.power > 0,
      state.tick % 2,
    ]);
    if (signature !== this.signature) {
      this.rebuild(state);
      this.signature = signature;
    }
    this.clear(this.overlays);
    const outline = (x: number, y: number, color: string) => {
      const p = gridToWorld(x, y);
      const h = terrainHeight(p.x, p.z) + 0.13;
      const pts = [
        [-0.47, -0.47],
        [0.47, -0.47],
        [0.47, 0.47],
        [-0.47, 0.47],
        [-0.47, -0.47],
      ].map(([a, b]) => new T.Vector3(p.x + a, h, p.z + b));
      const line = new T.Line(
        new T.BufferGeometry().setFromPoints(pts),
        new T.LineBasicMaterial({ color, depthTest: false }),
      );
      line.renderOrder = 1000;
      this.overlays.add(line);
    };
    if (tool === "extractor")
      for (const d of state.oreDeposits)
        if (d.remaining > 0) outline(d.x, d.y, "#c3b598");
    const selectedBuilding = state.buildings.find((b) => b.id === selected);
    if (selectedBuilding)
      outline(selectedBuilding.x, selectedBuilding.y, "#f2e2c1");
    if (selected === "landing_pad") outline(0, 0, "#f2e2c1");
    if (hover) {
      outline(
        hover.x,
        hover.y,
        tool || relocating ? (canPlace ? "#d9dde0" : "#D94F3D") : "#c1a58b",
      );
      if (tool) {
        const preview = buildingModel(tool, false);
        preview.traverse((o) => {
          if (o instanceof T.Mesh) {
            if (o.material instanceof T.MeshPhysicalMaterial)
              o.material.dispose();
            o.material = new T.MeshPhysicalMaterial({
              color: canPlace ? "#dfd1ad" : "#D94F3D",
              transparent: true,
              opacity: 0.35,
              depthWrite: false,
            });
            o.castShadow = false;
          }
        });
        this.at(preview, hover.x, hover.y, 0.11);
        this.overlays.add(preview);
      }
    }
    const haze = Math.max(0, 50 - state.oxygen) / 50;
    this.scene.fog = new T.FogExp2("#9d7355", haze * 0.012);
    this.renderer.render(this.scene, this.camera);
    this.renderStatusBadges(state);
    this.labelLayer.replaceChildren();
    const annotationLabels = annotations.map(a => {
      const p = gridToWorld(a.x, a.y);
      return { position: new T.Vector3(p.x, terrainHeight(p.x, p.z) + .95, p.z), text: a.text, color: "#d9dde0" };
    });
    for (const label of [...this.labels, ...annotationLabels]) {
      const p = label.position.clone().project(this.camera);
      const el = document.createElement("span");
      el.textContent = label.text;
      el.style.cssText = `left:${((p.x + 1) * this.width) / 2}px;top:${((1 - p.y) * this.height) / 2}px;color:${label.color}`;
      this.labelLayer.append(el);
    }
  }
  private renderStatusBadges(state: ColonyState): void {
    const visible = new Set<string>();
    for (const building of state.buildings) {
      const status = building.condition === "broken" ? "broken" :
        building.condition === "buried" ? "buried" :
        building.condition === "constructing" ? "constructing" :
        building.condition === "deactivated" || (state.power <= 0 && building.type !== "solar") ? "unpowered" : null;
      const anchor = this.statusAnchors.get(building.id);
      if (!status || !anchor) continue;
      visible.add(building.id);
      let badge = this.statusBadges.get(building.id);
      if (!badge) {
        badge = document.createElement("div");
        badge.setAttribute("role", "img");
        badge.dataset.buildingId = building.id;
        this.statusLayer.append(badge);
        this.statusBadges.set(building.id, badge);
      }
      if (badge.dataset.status !== status) {
        badge.dataset.status = status;
        badge.className = `building-status-badge building-status-${status}`;
        const description = status === "unpowered" ? "No power" : status === "broken" ? "Broken — repair required" : status === "constructing" ? "Under construction" : "Buried — excavation required";
        badge.setAttribute("aria-label", `${building.type}: ${description}`);
        badge.title = `${building.type}: ${description}`;
        const symbol = status === "unpowered"
          ? '<path d="M19 9 12 19h5l-2 7 9-11h-6l1-6Z" fill="currentColor"/><path d="m10 12 14 14" stroke="#201710" stroke-width="4"/><path d="m10 12 14 14" stroke="currentColor" stroke-width="2"/>'
          : status === "constructing"
            ? '<path d="M12 14h10v2H12zm0 4h7v2h-7z" fill="currentColor"/><path d="M11 12v10h2V12z" fill="currentColor"/>'
          : '<path d="M17 13v7" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><circle cx="17" cy="25" r="1.6" fill="currentColor"/>';
        badge.innerHTML = `<svg viewBox="0 0 34 34" aria-hidden="true"><path d="M17 3 32 30H2Z" fill="#201710" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>${symbol}</svg>`;
      }
      const p = anchor.clone().project(this.camera);
      badge.style.left = `${(p.x + 1) * this.width / 2}px`;
      badge.style.top = `${(1 - p.y) * this.height / 2}px`;
      badge.hidden = p.z < -1 || p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05;
    }
    for (const [id, badge] of this.statusBadges) {
      if (!visible.has(id)) { badge.remove(); this.statusBadges.delete(id); }
    }
  }

  private cast(x: number, y: number) {
    this.ray.setFromCamera(
      new T.Vector2((x / this.width) * 2 - 1, 1 - (y / this.height) * 2),
      this.camera,
    );
  }
  tileAt(x: number, y: number): GridPoint | null {
    this.cast(x, y);
    const hit = this.ray
      .intersectObjects(this.ground.children)
      .find((h) => h.object.userData.terrain);
    if (!hit) return null;
    const gx = Math.floor(hit.point.x),
      gy = Math.floor(hit.point.z);
    return gx >= 0 && gy >= 0 && gx < this.size && gy < this.size
      ? { x: gx, y: gy }
      : null;
  }
  buildingAt(x: number, y: number): string | null {
    this.cast(x, y);
    for (const hit of this.ray.intersectObjects(this.entities.children, true)) {
      let o: T.Object3D | null = hit.object;
      while (o && o !== this.entities) {
        if (o.userData.buildingId) return o.userData.buildingId;
        o = o.parent;
      }
    }
    return null;
  }
  destroy() {
    this.clear(this.entities);
    this.clear(this.overlays);
    this.scene.traverse((o) => {
      if (o instanceof T.Mesh || o instanceof T.LineSegments) {
        o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
    this.labelLayer.remove();
    this.statusLayer.remove();
    this.statusBadges.clear();
  }
}
