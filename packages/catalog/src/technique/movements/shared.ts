import type { EquipmentType, ExerciseTechnique, LocalizedText, TechniqueCue, TechniqueFigure, TechniqueMark, TechniquePose } from "@gym/contracts";

export const t = (vi: string, en: string): LocalizedText => ({ vi, en });

export const reviewed = { sourceId: "gym-local-original", reviewStatus: "reviewed", reviewedAt: "2026-11-21" } satisfies Pick<ExerciseTechnique, "sourceId" | "reviewStatus" | "reviewedAt">;

export const stepTitle = {
  setup: t("Vào thế", "Setup"),
  lower: t("Hạ xuống", "Lowering"),
  bottom: t("Điểm thấp nhất", "Bottom"),
  press: t("Đẩy lên", "Pressing up"),
  pull: t("Kéo", "Pulling"),
  top: t("Điểm cao nhất", "Top"),
  rise: t("Đứng lên", "Rising"),
  raise: t("Nâng lên", "Raising"),
  curl: t("Cuốn lên", "Curling"),
  extend: t("Duỗi ra", "Extending"),
  hold: t("Giữ", "Hold")
};

export type Frame = Omit<TechniqueFigure, "poses">;
type Shift = [number, number];

export const cue = (vi: string, en: string, mark: TechniqueMark = {}): TechniqueCue => ({ ...mark, text: t(vi, en) });
export const ang = (from: string, vertex: string, to: string, shift?: Shift): TechniqueMark => ({ angle: [from, vertex, to], ...(shift ? { shift } : {}) });
export const at = (joint: string, arrow?: number, shift?: Shift): TechniqueMark => ({ at: joint, ...(arrow === undefined ? {} : { arrow }), ...(shift ? { shift } : {}) });

/** Standing side-view frame: the front ankle is pinned to the floor at y=150. */
export const standing: Frame = { view: "side", floor: 155, box: [10, -14, 180, 174] };
export const onFloor = (x = 100): Pick<TechniquePose, "pin"> => ({ pin: ["ankle", x, 150] });

interface Spec {
  setup: [TechniquePose, TechniqueCue[], Partial<Frame>?];
  phases: [LocalizedText, TechniquePose[], TechniqueCue[], Partial<Frame>?][];
  mistakes: [LocalizedText, LocalizedText, TechniquePose, TechniquePose, TechniqueMark?, Partial<Frame>?][];
}

export function technique(movementId: string, equipment: EquipmentType[], frame: Frame, spec: Spec): ExerciseTechnique {
  const figure = (poses: TechniquePose[], override?: Partial<Frame>): TechniqueFigure => ({ ...frame, ...override, poses });
  return {
    movementId,
    equipment,
    ...reviewed,
    setup: { title: stepTitle.setup, figure: figure([spec.setup[0]], spec.setup[2]), cues: spec.setup[1] },
    phases: spec.phases.map(([title, poses, cues, override]) => ({ title, figure: figure(poses, override), cues })),
    mistakes: spec.mistakes.map(([title, fix, wrong, right, mark, override]) => ({ title, fix, wrong: figure([wrong], override), right: figure([right], override), ...(mark ? { mark } : {}) }))
  };
}
