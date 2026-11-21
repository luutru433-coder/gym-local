import { useEffect, useState } from "react";
import type { TechniqueFigure as Figure, TechniqueMark } from "@gym/contracts";
import { blendPose, markPoint, measureAngle, resolvePose, shownAngle } from "@gym/catalog/technique";
import type { Joints, Point } from "@gym/catalog/technique";

export interface FigureMark extends TechniqueMark {
  badge?: number;
}

const prefersReducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOVE_MS = 1500;
const HOLD_MS = 900;

function useProgress(animated: boolean) {
  const [progress, setProgress] = useState(1);
  useEffect(() => {
    if (!animated || prefersReducedMotion()) return;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - started) % (MOVE_MS + 2 * HOLD_MS);
      const linear = Math.min(1, Math.max(0, (elapsed - HOLD_MS / 2) / MOVE_MS));
      setProgress(linear * linear * (3 - 2 * linear));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animated]);
  return progress;
}

const line = (from: Point, to: Point, className: string, key?: string) => <line key={key} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} className={className} />;

function Limbs({ joints, suffix, far }: { joints: Joints; suffix: string; far?: boolean }) {
  const shoulder = joints[`shoulder${suffix || "1"}`];
  const hip = joints[`hip${suffix || "1"}`];
  if (!joints[`elbow${suffix}`]) return null;
  const className = far ? "tf-limb tf-limb--far" : "tf-limb";
  return (
    <g>
      <polyline className={className} points={[hip, joints[`knee${suffix}`], joints[`ankle${suffix}`], joints[`toe${suffix}`]].map((point) => point.join(",")).join(" ")} />
      <polyline className={className} points={[shoulder, joints[`elbow${suffix}`], joints[`wrist${suffix}`]].map((point) => point.join(",")).join(" ")} />
      {far ? null : [joints[`elbow${suffix}`], joints[`knee${suffix}`]].map((point, index) => <circle key={index} className="tf-joint" cx={point[0]} cy={point[1]} r={2.2} />)}
    </g>
  );
}

function Grip({ figure, joints }: { figure: Figure; joints: Joints }) {
  const kind = figure.grip?.kind ?? "none";
  if (kind === "none") return null;
  const hand = joints[figure.grip?.at ?? "wrist"];
  const [x, y] = [hand[0] + (figure.grip?.offset?.[0] ?? 0), hand[1] + (figure.grip?.offset?.[1] ?? 0)];
  const other = joints.wrist2;
  if (kind === "plate") {
    // A footplate that follows the sole: a line along ankle→toe, pushed to the side away from the knee.
    const [ankle, toe, knee] = [joints.ankle, joints.toe, joints.knee];
    const length = Math.hypot(toe[0] - ankle[0], toe[1] - ankle[1]) || 1;
    const along = [(toe[0] - ankle[0]) / length, (toe[1] - ankle[1]) / length];
    const side = (ankle[0] - knee[0]) * -along[1] + (ankle[1] - knee[1]) * along[0] >= 0 ? 1 : -1;
    const out = [-along[1] * side * 9, along[0] * side * 9];
    return <line className="tf-bar" x1={ankle[0] - along[0] * 14 + out[0]} y1={ankle[1] - along[1] * 14 + out[1]} x2={toe[0] + along[0] * 12 + out[0]} y2={toe[1] + along[1] * 12 + out[1]} />;
  }
  if (figure.view === "side") {
    if (kind === "bar") return <g><circle className="tf-plate" cx={x} cy={y} r={figure.grip?.size ?? 13} /><circle className="tf-bar-end" cx={x} cy={y} r={3} /></g>;
    if (kind === "dumbbell") return <g><rect className="tf-weight" x={x - 8} y={y - 5} width={16} height={10} rx={2.5} /></g>;
    return <circle className="tf-bar-end" cx={x} cy={y} r={3} />;
  }
  if (kind === "bar" && other) {
    const left = Math.min(x, other[0]) - 22;
    const right = Math.max(x, other[0]) + 22;
    return <g>{line([left, y], [right, other[1]], "tf-bar")}<rect className="tf-weight" x={left - 5} y={y - 9} width={5} height={18} rx={1.5} /><rect className="tf-weight" x={right} y={other[1] - 9} width={5} height={18} rx={1.5} /></g>;
  }
  return <g>{[[x, y], other].filter(Boolean).map((point, index) => kind === "dumbbell"
    ? <rect key={index} className="tf-weight" x={point[0] - 9} y={point[1] - 4.5} width={18} height={9} rx={2.5} />
    : <circle key={index} className="tf-bar-end" cx={point[0]} cy={point[1]} r={3} />)}</g>;
}

function Mark({ mark, joints, locale }: { mark: FigureMark; joints: Joints; locale: "vi" | "en" }) {
  const shift = mark.shift ?? [0, 0];
  const parts = [];
  let anchor: Point = joints[mark.at ?? "hip"];
  if (mark.angle) {
    const vertex = joints[mark.angle[1]];
    const from = markPoint(joints, mark.angle[0], vertex);
    const to = markPoint(joints, mark.angle[2], vertex);
    const radius = 17;
    const unit = (point: Point): Point => {
      const length = Math.hypot(point[0] - vertex[0], point[1] - vertex[1]) || 1;
      return [(point[0] - vertex[0]) / length, (point[1] - vertex[1]) / length];
    };
    const a = unit(from);
    const b = unit(to);
    const sweep = a[0] * b[1] - a[1] * b[0] > 0 ? 1 : 0;
    const middle = unit([vertex[0] + a[0] + b[0], vertex[1] + a[1] + b[1]]);
    anchor = [vertex[0] + middle[0] * 30, vertex[1] + middle[1] * 30];
    parts.push(
      line(vertex, [vertex[0] + a[0] * 28, vertex[1] + a[1] * 28], "tf-guide", "a"),
      line(vertex, [vertex[0] + b[0] * 28, vertex[1] + b[1] * 28], "tf-guide", "b"),
      <path key="arc" className="tf-arc" d={`M${vertex[0] + a[0] * radius} ${vertex[1] + a[1] * radius} A${radius} ${radius} 0 0 ${sweep} ${vertex[0] + b[0] * radius} ${vertex[1] + b[1] * radius}`} />
    );
  }
  if (mark.arrow !== undefined) {
    const radians = (mark.arrow * Math.PI) / 180;
    const [dx, dy] = [Math.cos(radians), -Math.sin(radians)];
    const start: Point = [anchor[0] + dx * 7, anchor[1] + dy * 7];
    const end: Point = [anchor[0] + dx * 24, anchor[1] + dy * 24];
    const wing = (turn: number): Point => [end[0] - Math.cos(radians + turn) * 6, end[1] + Math.sin(radians + turn) * 6];
    parts.push(line(start, end, "tf-arrow", "shaft"), <polyline key="head" className="tf-arrow" points={[wing(0.5), end, wing(-0.5)].map((point) => point.join(",")).join(" ")} />);
  }
  const [x, y] = [anchor[0] + shift[0], anchor[1] + shift[1]];
  const label = [mark.angle ? `${shownAngle(measureAngle(joints, mark.angle))}°` : "", mark.tag?.[locale] ?? ""].filter(Boolean).join(" ");
  return (
    <g>
      {parts}
      {mark.badge ? <g><circle className="tf-badge" cx={x} cy={y} r={6.5} /><text className="tf-badge-text" x={x} y={y + 2.8} textAnchor="middle">{mark.badge}</text></g> : null}
      {label ? <text className="tf-label" x={x + (mark.badge ? 9 : 0)} y={y + 3} textAnchor={mark.badge ? "start" : "middle"}>{label}</text> : null}
    </g>
  );
}

export function TechniqueFigure({ figure, marks = [], locale, tone, label }: { figure: Figure; marks?: FigureMark[]; locale: "vi" | "en"; tone?: "wrong" | "right"; label: string }) {
  const progress = useProgress(figure.poses.length > 1);
  const last = figure.poses[figure.poses.length - 1];
  const pose = figure.poses.length > 1 ? blendPose(figure.poses[0], last, progress) : last;
  const joints = resolvePose(pose, figure.view);
  const symmetric = figure.view !== "side";
  return (
    <svg className={`technique-figure${tone ? ` technique-figure--${tone}` : ""}`} viewBox={(figure.box ?? [0, 0, 200, 170]).join(" ")} role="img" aria-label={label}>
      {figure.pads?.map(([x, y, width, height], index) => <rect key={index} className="tf-pad" x={x} y={y} width={width} height={height} rx={3} />)}
      {figure.floor ? line([8, figure.floor], [192, figure.floor], "tf-floor") : null}
      {figure.lines?.map(([x1, y1, x2, y2], index) => line([x1, y1], [x2, y2], "tf-prop", String(index)))}
      {figure.cable ? line(figure.cable, joints[figure.grip?.at ?? "wrist"], "tf-cable") : null}
      {!symmetric ? <Limbs joints={joints} suffix="2" far /> : null}
      {symmetric
        ? <polygon className="tf-torso" points={[joints.shoulder1, joints.shoulder2, joints.hip2, joints.hip1].map((point) => point.join(",")).join(" ")} />
        : <polyline className="tf-torso-side" points={[joints.hip, joints.spine, joints.shoulder].map((point) => point.join(",")).join(" ")} />}
      <circle className="tf-head" cx={joints.head[0]} cy={joints.head[1]} r={8.5} />
      <Limbs joints={joints} suffix="" />
      {symmetric ? <Limbs joints={joints} suffix="2" /> : null}
      <Grip figure={figure} joints={joints} />
      {marks.map((mark, index) => <Mark key={index} mark={mark} joints={joints} locale={locale} />)}
    </svg>
  );
}
