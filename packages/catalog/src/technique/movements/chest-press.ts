import type { ExerciseTechnique, TechniqueFigure, TechniquePose } from "@gym/contracts";
import { reviewed, stepTitle, t } from "./shared";

const bench: TechniqueFigure["pads"] = [[58, 104, 104, 7], [72, 111, 5, 37], [144, 111, 5, 37]];
const legs: Pick<TechniquePose, "leg" | "foot"> = { leg: [-8, -98], foot: 0 };
const lying = { hip: [122, 97] as [number, number], torso: 180, ...legs };

const sideTop: TechniquePose = { ...lying, arm: [90, 90] };
const sideBottom: TechniquePose = { ...lying, arm: [-14, 90] };
const sideNeck: TechniquePose = { ...lying, arm: [-14, 122] };
const sideHipsUp: TechniquePose = { hip: [120, 84], torso: 197, leg: [-2, -92], foot: 0, arm: [-30, 90] };

const above = { hip: [100, 112] as [number, number], torso: 90, leg: [-78, -80] as [number, number], foot: -75 };
const aboveTop: TechniquePose = { ...above, arm: [-45, 90], scale: { upper: 0.3, fore: 0.2, shin: 0.6 } };
const aboveBottom: TechniquePose = { ...above, arm: [-45, 90], scale: { upper: 0.95, fore: 0.2, shin: 0.6 } };
const aboveFlared: TechniquePose = { ...above, arm: [0, 90], scale: { upper: 0.95, fore: 0.2, shin: 0.6 } };
const topPad: TechniqueFigure["pads"] = [[84, 34, 32, 92]];

function chestPress(kind: "bar" | "dumbbell", equipment: ExerciseTechnique["equipment"]): ExerciseTechnique {
  const bar = kind === "bar";
  const side = (poses: TechniquePose[]): TechniqueFigure => ({ view: "side", poses, grip: { kind }, floor: 148, pads: bench, box: [30, 22, 160, 136] });
  const top = (poses: TechniquePose[]): TechniqueFigure => ({ view: "top", poses, grip: { kind }, pads: topPad, box: [30, 30, 140, 119] });
  return {
    movementId: "chest_press",
    equipment,
    ...reviewed,
    setup: {
      title: stepTitle.setup,
      figure: side([sideTop]),
      cues: [
        {
          at: "wrist", shift: [-12, -4],
          text: bar
            ? t("Tay: nắm rộng khoảng 1,5 lần vai, thanh đòn nằm ở gốc bàn tay, cổ tay thẳng ngay trên khuỷu.", "Hands: grip about 1.5× shoulder width, bar low on the heel of the palm, wrists straight over the elbows.")
            : t("Tay: tạ nằm ở gốc bàn tay, cổ tay thẳng ngay trên khuỷu, hai tạ ở trên vai.", "Hands: dumbbells low on the heel of the palm, wrists straight over the elbows, both weights above the shoulders.")
        },
        { at: "shoulder", arrow: -25, shift: [-6, 24], text: t("Bả vai: kép hai bả vai về sau rồi hạ xuống phía hông, giữ nguyên suốt set.", "Shoulder blades: squeeze them together, then pull them down toward the hips and keep them there all set.") },
        { at: "hip", shift: [-20, -16], text: t("Lưng: ưỡn nhẹ lưng trên, ngực nâng cao; mông và lưng trên luôn chạm ghế.", "Back: slight upper-back arch, chest lifted; glutes and upper back stay on the bench.") },
        { angle: ["hip", "knee", "ankle"], shift: [-34, 16], text: t("Chân: cả bàn chân chạm sàn, gối gập khoảng 80–90°, bàn chân nằm dưới gối.", "Feet: whole foot on the floor, knees bent about 80–90°, feet under the knees.") }
      ]
    },
    phases: [
      {
        title: stepTitle.lower,
        figure: top([aboveTop, aboveBottom]),
        cues: [
          { angle: ["along", "shoulder1", "elbow"], text: t("Khuỷu tay mở khoảng 45° so với thân (trong khoảng 45–60°), không xòe ngang vai.", "Elbows open about 45° from the torso (45–60° range), not straight out at shoulder level.") },
          { at: "wrist2", shift: [-10, 12], text: bar ? t("Thanh đòn đi xuống phần ngực dưới (ngang núm vú), không xuống cổ.", "The bar travels down to the lower chest (nipple line), not toward the neck.") : t("Tạ đi xuống hai bên phần ngực dưới, không xuống ngang cổ.", "The dumbbells travel down beside the lower chest, not level with the neck.") },
          { at: "shoulder2", arrow: -90, shift: [-12, -8], text: t("Vai vẫn hạ thấp xa tai, không nhún vai khi hạ tạ.", "Shoulders stay down away from the ears; no shrugging as the weight comes down.") }
        ]
      },
      {
        title: stepTitle.bottom,
        figure: side([sideBottom]),
        cues: [
          { angle: ["fwd", "elbow", "wrist"], shift: [10, 0], text: t("Cẳng tay thẳng đứng 90° so với sàn, cổ tay ngay trên khuỷu.", "Forearms vertical, 90° to the floor, wrists directly over the elbows.") },
          { at: "elbow", shift: [-2, 22], text: t("Khuỷu thấp hơn thân một chút; dừng khi tạ chạm nhẹ ngực, không nảy.", "Elbows slightly below the torso; stop at a light touch on the chest, no bounce.") },
          { at: "shoulder", arrow: -25, shift: [-14, 24], text: t("Bả vai vẫn kéo về sau và hạ xuống, ngực vẫn nâng cao.", "Shoulder blades still back and down, chest still lifted.") }
        ]
      },
      {
        title: stepTitle.press,
        figure: side([sideBottom, sideTop]),
        cues: [
          { at: "wrist", arrow: 125, shift: [12, -4], text: t("Đẩy tạ lên và hơi chếch về phía đầu, kết thúc ngay trên khớp vai.", "Press up and slightly back toward the head, finishing directly over the shoulder joint.") },
          { angle: ["shoulder", "elbow", "wrist"], shift: [10, 0], text: t("Duỗi tay gần thẳng (khoảng 170–180°), không khóa giật khuỷu.", "Finish with the arms almost straight (about 170–180°) without snapping the elbows locked.") },
          { at: "shoulder", shift: [-10, 24], text: t("Không đẩy vai rời ghế ở cuối: bả vai vẫn ép xuống ghế.", "Do not let the shoulders roll off the bench at the top: blades stay pinned to the bench.") }
        ]
      }
    ],
    mistakes: [
      {
        title: t("Xòe khuỷu ngang vai (90°)", "Elbows flared to 90°"),
        fix: t("Khép khuỷu về khoảng 45° và hạ tạ xuống ngực dưới thay vì ngang cổ.", "Tuck the elbows to about 45° and lower to the lower chest instead of the neck line."),
        wrong: top([aboveFlared]),
        right: top([aboveBottom]),
        mark: { angle: ["along", "shoulder1", "elbow"] }
      },
      {
        title: t("Hạ tạ về phía cổ, cẳng tay nghiêng", "Lowering toward the neck with tilted forearms"),
        fix: t("Chạm tạ ở ngực dưới để cẳng tay thẳng đứng 90° ở điểm thấp nhất.", "Touch the lower chest so the forearms are vertical (90°) at the bottom."),
        wrong: side([sideNeck]),
        right: side([sideBottom]),
        mark: { angle: ["fwd", "elbow", "wrist"], shift: [10, 0] }
      },
      {
        title: t("Nhấc mông khỏi ghế", "Hips lifting off the bench"),
        fix: t("Giữ mông chạm ghế, đạp chân xuống sàn theo hướng về phía đầu; giảm tải nếu vẫn nhấc mông.", "Keep the glutes on the bench and drive the feet into the floor toward the head; reduce the load if the hips still lift."),
        wrong: side([sideHipsUp]),
        right: side([sideBottom]),
        mark: { at: "hip", arrow: -90, shift: [12, -14] }
      }
    ]
  };
}

export const chestPressTechniques: ExerciseTechnique[] = [
  chestPress("bar", ["barbell", "smith"]),
  chestPress("dumbbell", ["dumbbell"])
];
