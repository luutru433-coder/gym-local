import type { TechniqueFigure, TechniqueLimb, TechniquePose } from "@gym/contracts";

export type Point = [number, number];
export type Joints = Record<string, Point>;

const LENGTH = { torso: 46, head: 20, upper: 27, fore: 25, thigh: 40, shin: 38, foot: 13 };
const SHOULDER_HALF = 17;
const HIP_HALF = 9;

const rad = (degrees: number) => (degrees * Math.PI) / 180;
const step = (from: Point, degrees: number, length: number): Point => [from[0] + Math.cos(rad(degrees)) * length, from[1] - Math.sin(rad(degrees)) * length];
const direction = (from: Point, to: Point) => (Math.atan2(from[1] - to[1], to[0] - from[0]) * 180) / Math.PI;

function limbAngles(limb: TechniqueLimb, root: Point, first: number, second: number): [number, number] {
  if (Array.isArray(limb)) return limb;
  const reach = Math.min(Math.hypot(limb.to[0] - root[0], limb.to[1] - root[1]), first + second - 0.01);
  const toward = direction(root, limb.to);
  const inner = (Math.acos(Math.min(1, Math.max(-1, (first * first + reach * reach - second * second) / (2 * first * reach)))) * 180) / Math.PI;
  const firstAngle = toward + (limb.bend ?? 1) * inner;
  const joint = step(root, firstAngle, first);
  return [firstAngle, direction(joint, limb.to)];
}

const mirrorLimb = (limb: TechniqueLimb, axis: number): TechniqueLimb => Array.isArray(limb)
  ? [180 - limb[0], 180 - limb[1]]
  : { to: [2 * axis - limb.to[0], limb.to[1]], bend: limb.bend === -1 ? 1 : -1 };

function build(pose: TechniquePose, symmetric: boolean, hip: Point): Joints {
  const scale = pose.scale ?? {};
  const torso = pose.torso ?? 90;
  const round = symmetric ? 0 : pose.round ?? 0;
  const half = (LENGTH.torso * (scale.torso ?? 1)) / 2;
  const spine = step(hip, torso + round, half);
  const shoulder = step(spine, torso - round, half);
  const joints: Joints = { hip, spine, shoulder, head: step(shoulder, torso - round * 1.5 + (pose.head ?? 0), LENGTH.head) };
  const limb = (suffix: string, armRoot: Point, legRoot: Point, arm: TechniqueLimb, leg: TechniqueLimb, foot: number) => {
    const upper = LENGTH.upper * (scale.upper ?? 1);
    const fore = LENGTH.fore * (scale.fore ?? 1);
    const thigh = LENGTH.thigh * (scale.thigh ?? 1);
    const shin = LENGTH.shin * (scale.shin ?? 1);
    const [upperAngle, foreAngle] = limbAngles(arm, armRoot, upper, fore);
    const [thighAngle, shinAngle] = limbAngles(leg, legRoot, thigh, shin);
    joints[`shoulder${suffix || "1"}`] = armRoot;
    joints[`hip${suffix || "1"}`] = legRoot;
    joints[`elbow${suffix}`] = step(armRoot, upperAngle, upper);
    joints[`wrist${suffix}`] = step(joints[`elbow${suffix}`], foreAngle, fore);
    joints[`knee${suffix}`] = step(legRoot, thighAngle, thigh);
    joints[`ankle${suffix}`] = step(joints[`knee${suffix}`], shinAngle, shin);
    joints[`toe${suffix}`] = step(joints[`ankle${suffix}`], foot, LENGTH.foot);
  };
  if (symmetric) {
    const across = torso - 90;
    limb("", step(shoulder, across, SHOULDER_HALF), step(hip, across, HIP_HALF), pose.arm, pose.leg, pose.foot ?? -60);
    limb("2", step(shoulder, across + 180, SHOULDER_HALF), step(hip, across + 180, HIP_HALF), pose.arm2 ?? mirrorLimb(pose.arm, hip[0]), pose.leg2 ?? mirrorLimb(pose.leg, hip[0]), pose.foot2 ?? 180 - (pose.foot ?? -60));
  } else {
    limb("", shoulder, hip, pose.arm, pose.leg, pose.foot ?? 0);
    if (pose.arm2 || pose.leg2) limb("2", shoulder, hip, pose.arm2 ?? pose.arm, pose.leg2 ?? pose.leg, pose.foot2 ?? pose.foot ?? 0);
  }
  return joints;
}

export function resolvePose(pose: TechniquePose, view: TechniqueFigure["view"]): Joints {
  const symmetric = view !== "side";
  const start: Point = pose.hip ?? [100, 100];
  if (!pose.pin) return build(pose, symmetric, start);
  const [name, x, y] = pose.pin;
  const first = build(pose, symmetric, start)[name];
  return build(pose, symmetric, [start[0] + x - first[0], start[1] + y - first[1]]);
}

function mix<T>(from: T, to: T, amount: number): T {
  if (typeof from === "number" && typeof to === "number") return (from + (to - from) * amount) as T;
  if (Array.isArray(from) && Array.isArray(to)) return from.map((value, index) => mix(value, to[index], amount)) as T;
  if (from && to && typeof from === "object" && typeof to === "object" && !Array.isArray(to)) {
    return Object.fromEntries(Object.entries(from).map(([key, value]) => [key, mix(value, (to as Record<string, unknown>)[key] ?? value, amount)])) as T;
  }
  return from;
}

export function blendPose(from: TechniquePose, to: TechniquePose, amount: number): TechniquePose {
  return mix(from, to, amount);
}

/** Resolves a joint name or one of the reference directions measured from the vertex. */
export function markPoint(joints: Joints, name: string, vertex: Point): Point {
  if (name === "up") return [vertex[0], vertex[1] - 30];
  if (name === "down") return [vertex[0], vertex[1] + 30];
  if (name === "fwd") return [vertex[0] + 30, vertex[1]];
  if (name === "back") return [vertex[0] - 30, vertex[1]];
  if (name === "along") return [vertex[0] + joints.hip[0] - joints.shoulder[0], vertex[1] + joints.hip[1] - joints.shoulder[1]];
  return joints[name];
}

export function measureAngle(joints: Joints, [from, vertexName, to]: [string, string, string]): number {
  const vertex = joints[vertexName];
  const a = markPoint(joints, from, vertex);
  const b = markPoint(joints, to, vertex);
  const first = Math.atan2(a[1] - vertex[1], a[0] - vertex[0]);
  const second = Math.atan2(b[1] - vertex[1], b[0] - vertex[0]);
  const degrees = Math.abs(((second - first) * 180) / Math.PI) % 360;
  return degrees > 180 ? 360 - degrees : degrees;
}

export const shownAngle = (degrees: number) => Math.round(degrees / 5) * 5;
