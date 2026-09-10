import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { BuildingType } from "../../simulation/types";

// Shared materials and geometry stay resident across state updates.
const materials = new Map<string, T.MeshStandardMaterial>();
export function material(color: string, metalness = 0.25, emissive = false) {
  const key = `${color}/${metalness}/${emissive}`;
  if (!materials.has(key))
    materials.set(
      key,
      new T.MeshStandardMaterial({
        color,
        metalness,
        roughness: metalness > 0.6 ? 0.3 : 0.7,
        emissive: emissive ? color : "#000000",
        emissiveIntensity: emissive ? 0.6 : 0,
      }),
    );
  return materials.get(key)!;
}
const boxGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.04);
const landingRingGeo = new T.TorusGeometry(0.39, 0.009, 6, 48);
const capsuleNoseGeo = new T.ConeGeometry(0.22, 0.28, 24);
const canopyGeo = new T.BoxGeometry(0.75, 0.25, 0.76);
const sphereGeo = new T.SphereGeometry(1, 20, 12);
const cylinderGeo = new T.CylinderGeometry(1, 1, 1, 24);
export const palette = {
  shell: "#ded5bf",
  dark: "#293239",
  orange: "#bd6539",
  glass: "#253f50",
  steel: "#737d7c",
  gold: "#bd9149",
  soil: "#925b40",
};
export function part(
  parent: T.Object3D,
  geometry: T.BufferGeometry,
  color: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  metal = 0.25,
  glow = false,
) {
  const mesh = new T.Mesh(geometry, material(color, metal, glow));
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function box(
  p: T.Object3D,
  c: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  metal = 0.25,
  glow = false,
) {
  return part(p, boxGeo, c, x, y, z, w, h, d, metal, glow);
}
export function sphere(
  p: T.Object3D,
  c: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  metal = 0.25,
) {
  return part(p, sphereGeo, c, x, y, z, w, h, d, metal);
}
export function cylinder(
  p: T.Object3D,
  c: string,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  metal = 0.25,
) {
  return part(p, cylinderGeo, c, x, y, z, r, h, r, metal);
}
function strut(p: T.Object3D, a: T.Vector3, b: T.Vector3, radius = 0.018) {
  const v = b.clone().sub(a);
  const m = cylinder(
    p,
    palette.steel,
    ...(a.clone().add(b).multiplyScalar(0.5).toArray() as [
      number,
      number,
      number,
    ]),
    radius,
    v.length(),
    0.7,
  );
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v.normalize());
}
export function astronaut(health = 100, aged = false, seated = false) {
  const g = new T.Group();
  const c = palette;
  box(g, c.shell, 0, 0.16, 0, 0.09, 0.13, 0.065);
  box(g, c.orange, 0, 0.17, 0.037, 0.067, 0.055, 0.016);
  box(g, c.dark, 0, 0.17, -0.06, 0.074, 0.1, 0.05);
  sphere(g, aged ? "#a4a6a3" : c.shell, 0, 0.267, 0, 0.065, 0.065, 0.058);
  sphere(g, c.gold, 0, 0.269, 0.038, 0.05, 0.039, 0.028, 0.8);
  for (const s of [-1, 1]) {
    const leg = box(
      g,
      c.shell,
      s * 0.029,
      0.065,
      seated ? 0.035 : 0,
      0.035,
      0.105,
      0.037,
    );
    if (seated) leg.rotation.x = -1;
    box(g, c.dark, s * 0.03, 0.018, 0.021, 0.038, 0.025, 0.06);
    const arm = box(g, c.shell, s * 0.066, 0.153, 0.013, 0.027, 0.115, 0.033);
    arm.rotation.z = s * 0.16;
  }
  g.rotation.x = (100 - health) / 400;
  return g;
}
export function roverModel(occupants: number) {
  const g = new T.Group(),
    c = palette;
  box(g, c.dark, 0, 0.13, 0, 0.34, 0.09, 0.57);
  box(g, c.shell, 0, 0.22, -0.19, 0.35, 0.12, 0.18);
  box(g, c.orange, 0, 0.2, 0.23, 0.35, 0.08, 0.09);
  for (const x of [-0.21, 0.21])
    for (const z of [-0.2, 0.2]) {
      const wheel = cylinder(g, c.dark, x, 0.105, z, 0.105, 0.075);
      wheel.rotation.z = Math.PI / 2;
      const hub = cylinder(g, c.steel, x * 1.15, 0.105, z, 0.05, 0.012, 0.8);
      hub.rotation.z = Math.PI / 2;
    }
  for (const x of [-0.09, 0.09]) {
    box(g, c.dark, x, 0.2, 0.015, 0.13, 0.04, 0.16);
    box(g, c.dark, x, 0.255, -0.07, 0.13, 0.13, 0.04);
    box(g, "#fff0c8", x, 0.22, 0.281, 0.06, 0.035, 0.012, 0.1, true);
    strut(
      g,
      new T.Vector3(x * 1.8, 0.18, -0.17),
      new T.Vector3(x * 1.8, 0.43, -0.12),
    );
  }
  strut(g, new T.Vector3(-0.16, 0.43, -0.12), new T.Vector3(0.16, 0.43, -0.12));
  cylinder(g, c.steel, 0.15, 0.42, -0.22, 0.008, 0.4);
  for (let i = 0; i < Math.min(2, occupants); i++) {
    const a = astronaut(100, false, true);
    a.position.set(i ? 0.09 : -0.09, 0.16, 0.015);
    g.add(a);
  }
  return g;
}
export function buildingModel(type: BuildingType, active: boolean, docked = 0) {
  const g = new T.Group(),
    c = palette;
  box(g, c.dark, 0, 0.035, 0, 0.92, 0.07, 0.92);
  for (const x of [-0.4, 0.4])
    for (const z of [-0.4, 0.4])
      box(g, c.steel, x, 0.08, z, 0.065, 0.14, 0.065);
  if (type === "habitat") {
    const hull = cylinder(g, c.shell, 0, 0.3, 0, 0.28, 0.69);
    hull.rotation.z = Math.PI / 2;
    for (const x of [-0.34, 0.34]) {
      sphere(g, c.shell, x, 0.3, 0, 0.1, 0.28, 0.28);
      const ring = cylinder(g, c.steel, x, 0.3, 0, 0.287, 0.025, 0.7);
      ring.rotation.z = Math.PI / 2;
    }
    for (const x of [-0.21, 0, 0.21])
      box(g, c.glass, x, 0.34, 0.26, 0.13, 0.115, 0.035, 0.7);
    box(g, c.orange, 0, 0.53, 0, 0.25, 0.04, 0.23);
    box(g, c.dark, 0.43, 0.22, 0, 0.06, 0.28, 0.18);
    box(g, c.steel, 0.48, 0.1, 0, 0.13, 0.04, 0.24);
    cylinder(g, c.steel, -0.25, 0.7, -0.1, 0.008, 0.28);
  } else if (type === "solar") {
    for (const x of [-0.24, 0.24]) {
      cylinder(g, c.steel, x, 0.2, 0, 0.025, 0.32);
      const panel = new T.Group();
      panel.position.set(x, 0.35, 0);
      panel.rotation.x = -0.26;
      g.add(panel);
      box(panel, c.steel, 0, 0, 0, 0.41, 0.035, 0.83);
      for (let row = 0; row < 6; row++)
        for (let col = 0; col < 3; col++)
          box(
            panel,
            active ? "#294c70" : "#273138",
            (col - 1) * 0.124,
            0.023,
            (row - 2.5) * 0.13,
            0.116,
            0.008,
            0.122,
            0.75,
          );
    }
  } else if (type === "scrubber") {
    for (const x of [-0.2, 0.2]) {
      cylinder(g, c.shell, x, 0.4, 0, 0.145, 0.61);
      cylinder(g, c.steel, x, 0.73, 0, 0.16, 0.055, 0.8);
      for (let i = 0; i < 5; i++)
        cylinder(g, c.dark, x, 0.25 + i * 0.075, 0, 0.151, 0.018);
      sphere(g, c.steel, x, 0.77, 0, 0.13, 0.055, 0.13, 0.7);
    }
    box(g, c.orange, 0, 0.25, 0.24, 0.38, 0.3, 0.16);
    box(
      g,
      active ? "#b8d3b3" : c.dark,
      0,
      0.29,
      0.327,
      0.22,
      0.035,
      0.008,
      0.1,
      active,
    );
  } else if (type === "farm") {
    box(g, c.shell, 0, 0.12, 0, 0.82, 0.11, 0.82);
    for (let i = 0; i < 5; i++) {
      box(g, c.dark, (i - 2) * 0.145, 0.19, 0, 0.12, 0.08, 0.7);
      for (let j = 0; j < 6; j++)
        sphere(
          g,
          active ? "#769267" : "#685e44",
          (i - 2) * 0.145,
          0.25,
          (j - 2.5) * 0.105,
          0.046,
          0.047,
          0.045,
        );
    }
    for (const z of [-0.37, 0, 0.37]) {
      strut(g, new T.Vector3(-0.4, 0.17, z), new T.Vector3(-0.27, 0.48, z));
      strut(g, new T.Vector3(-0.27, 0.48, z), new T.Vector3(0.27, 0.48, z));
      strut(g, new T.Vector3(0.27, 0.48, z), new T.Vector3(0.4, 0.17, z));
    }
    const glass = new T.MeshPhysicalMaterial({
      color: "#97b3ab",
      transparent: true,
      opacity: 0.16,
      roughness: 0.15,
      metalness: 0.1,
      depthWrite: false,
      side: T.DoubleSide,
    });
    const canopy = new T.Mesh(canopyGeo, glass);
    canopy.position.y = 0.34;
    g.add(canopy);
  } else if (type === "garage") {
    box(g, c.shell, 0, 0.34, -0.34, 0.85, 0.52, 0.12);
    for (const x of [-0.39, 0.39])
      box(g, c.shell, x, 0.32, 0, 0.09, 0.49, 0.78);
    box(g, c.shell, 0, 0.59, 0, 0.89, 0.07, 0.85);
    for (let i = 0; i < 7; i++)
      box(g, c.steel, (i - 3) * 0.12, 0.635, 0, 0.022, 0.017, 0.79);
    for (let i = 0; i < 2; i++)
      box(
        g,
        i < docked ? "#b8d3b3" : c.dark,
        (i - 0.5) * 0.25,
        0.63,
        0.36,
        0.12,
        0.026,
        0.07,
        0.1,
        i < docked,
      );
    for (const x of [-0.32, 0.32])
      box(g, c.orange, x, 0.32, 0.403, 0.045, 0.41, 0.015);
  } else if (type === "refinery") {
    box(g, c.steel, 0, 0.2, 0, 0.72, 0.26, 0.7);
    cylinder(g, c.orange, -0.2, 0.45, 0, 0.19, 0.4);
    sphere(g, c.steel, -0.2, 0.67, 0, 0.19, 0.1, 0.19, 0.7);
    cylinder(g, c.dark, 0.22, 0.59, -0.2, 0.09, 0.96);
    for (const h of [0.4, 0.7, 0.95])
      cylinder(g, c.steel, 0.22, h, -0.2, 0.102, 0.05);
    for (let i = 0; i < 3; i++)
      cylinder(g, c.shell, (i - 1) * 0.17, 0.31, 0.29, 0.057, 0.3);
    box(
      g,
      active ? "#db8c49" : c.dark,
      -0.2,
      0.39,
      0.185,
      0.14,
      0.1,
      0.02,
      0.3,
      active,
    );
  } else {
    box(g, c.orange, -0.1, 0.25, -0.1, 0.56, 0.3, 0.55);
    box(g, c.steel, -0.1, 0.43, -0.1, 0.6, 0.07, 0.58);
    const arm = box(g, c.steel, 0.24, 0.32, 0.12, 0.12, 0.48, 0.12);
    arm.rotation.z = -0.6;
    const scoop = box(g, c.dark, 0.37, 0.16, 0.25, 0.3, 0.13, 0.32);
    scoop.rotation.x = -0.3;
    for (let i = 0; i < 4; i++)
      box(g, c.steel, 0.26 + i * 0.075, 0.09, 0.43, 0.035, 0.08, 0.09);
    for (let i = 0; i < 4; i++)
      box(g, c.dark, -0.12, 0.27 + i * 0.04, 0.184, 0.3, 0.016, 0.017);
  }
  return g;
}
export function landingModel(occupied: boolean) {
  const g = new T.Group(),
    c = palette;
  cylinder(g, c.dark, 0, 0.03, 0, 0.47, 0.055);
  const ring = new T.Mesh(landingRingGeo, material(c.shell));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.063;
  g.add(ring);
  for (const x of [-0.36, 0.36])
    for (const z of [-0.36, 0.36])
      box(g, c.gold, x, 0.085, z, 0.04, 0.06, 0.04, 0.1, true);
  if (occupied) {
    cylinder(g, c.shell, 0, 0.4, 0, 0.22, 0.48);
    part(g, capsuleNoseGeo, c.shell, 0, 0.78, 0, 1, 1, 1);
    sphere(g, c.glass, 0, 0.49, 0.2, 0.09, 0.09, 0.032, 0.8);
    for (const x of [-0.28, 0.28])
      for (const z of [-0.28, 0.28])
        strut(
          g,
          new T.Vector3(x, 0.08, z),
          new T.Vector3(x * 0.5, 0.35, z * 0.5),
          0.025,
        );
  }
  return g;
}
