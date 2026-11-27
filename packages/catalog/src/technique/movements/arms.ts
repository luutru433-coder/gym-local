import type { ExerciseTechnique, TechniquePose } from "@gym/contracts";
import { ang, at, cue, onFloor, standing, stepTitle, t, technique } from "./shared";
import type { Frame } from "./shared";

const legs = { ...onFloor(96), leg: [-89, -91] as [number, number] };
const elbowAngle = ang("shoulder", "elbow", "wrist", [16, 0]);

function curl(movementId: "biceps_curl" | "hammer_curl", kind: "bar" | "dumbbell", equipment: ExerciseTechnique["equipment"]): ExerciseTechnique {
  const hammer = movementId === "hammer_curl";
  const frame: Frame = { ...standing, grip: { kind, size: 9 } };
  const down: TechniquePose = { ...legs, torso: 90, arm: [-90, -84] };
  const up: TechniquePose = { ...legs, torso: 90, arm: [-86, 50] };
  return technique(movementId, equipment, frame, {
    setup: [down, [
      cue(hammer ? "Tay: lòng bàn tay hướng vào nhau (ngón cái hướng lên) và giữ nguyên suốt rep." : "Tay: nắm ngửa, rộng bằng vai, cổ tay thẳng.", hammer ? "Hands: palms facing each other (thumbs up) and kept that way all rep." : "Hands: underhand grip at shoulder width, wrists straight.", at("wrist", undefined, [14, 0])),
      cue("Khuỷu: ép sát sườn, ngay dưới vai.", "Elbows: tucked against the ribs, directly under the shoulders.", at("elbow", undefined, [-16, 0])),
      cue("Thân và bả vai: đứng thẳng, vai hạ và kéo nhẹ về sau, gồng bụng.", "Trunk and shoulder blades: stand tall, shoulders down and slightly back, abs braced.", at("shoulder", undefined, [-16, 0]))
    ]],
    phases: [
      [stepTitle.curl, [down, up], [
        cue("Chỉ gập khuỷu; cánh tay trên đứng yên thẳng đứng.", "Only the elbows bend; the upper arms stay vertical and still.", ang("down", "shoulder", "elbow", [-18, 10])),
        cue("Cuốn đến khi khuỷu gập còn khoảng 40–50°, tạ ngang vai.", "Curl until the elbows close to about 40–50°, weight at shoulder height.", elbowAngle),
        cue("Thân không ngả ra sau.", "The torso does not lean back.", at("spine", undefined, [-18, 0]))
      ]],
      [stepTitle.lower, [up, down], [
        cue("Hạ chậm trong 2–3 giây.", "Lower over 2–3 seconds.", at("wrist", -90, [14, 0])),
        cue("Duỗi tay gần hết, khoảng 170°, trước rep sau.", "Straighten to about 170° before the next rep.", elbowAngle),
        cue("Khuỷu vẫn sát sườn, không trôi ra sau.", "Elbows stay at the ribs and do not drift back.", at("elbow", undefined, [-16, 0]))
      ]]
    ],
    mistakes: [
      [t("Ngả người và vung tạ", "Leaning back and swinging"), t("Đứng thẳng, giảm tải để chỉ khuỷu chuyển động.", "Stand tall and reduce the load so only the elbows move."), { ...legs, torso: 108, round: -8, arm: [-60, 80] }, up, ang("up", "hip", "shoulder", [-10, -8])],
      [t("Khuỷu đưa ra trước", "Elbows drifting forward"), t("Giữ khuỷu sát sườn dưới vai; cánh tay trên thẳng đứng.", "Keep the elbows at the ribs under the shoulders; upper arms vertical."), { ...legs, torso: 90, arm: [-45, 95] }, up, ang("down", "shoulder", "elbow", [-18, 10])],
      [t("Không duỗi hết tay", "Stopping short at the bottom"), t("Hạ đến khi tay gần thẳng (khoảng 170°) ở mỗi rep.", "Lower until the arms are nearly straight (about 170°) on every rep."), { ...legs, torso: 90, arm: [-88, -30] }, down, elbowAngle]
    ]
  });
}

function pushdown(): ExerciseTechnique {
  const frame: Frame = { ...standing, grip: { kind: "handle" }, cable: [150, -8] };
  const pose = (fore: number): TechniquePose => ({ ...legs, torso: 82, arm: [-84, fore] });
  const top = pose(40);
  const bottom = pose(-80);
  return technique("triceps_pushdown", ["cable", "resistance_band"], frame, {
    setup: [top, [
      cue("Tay: nắm thanh hoặc dây ngang ngực, cổ tay thẳng.", "Hands: hold the bar or rope at chest height, wrists straight.", at("wrist", undefined, [14, 0])),
      cue("Khuỷu: ép sát sườn, cánh tay trên thẳng đứng.", "Elbows: pinned to the ribs, upper arms vertical.", at("elbow", undefined, [-16, 4])),
      cue("Thân: nghiêng nhẹ về trước 5–10°, vai hạ thấp, gồng bụng.", "Trunk: lean forward 5–10°, shoulders down, abs braced.", ang("up", "hip", "shoulder", [-12, -8]))
    ]],
    phases: [
      [stepTitle.press, [top, bottom], [
        cue("Chỉ duỗi khuỷu; khuỷu không rời sườn.", "Only the elbows extend; they never leave the ribs.", at("elbow", undefined, [-16, 4])),
        cue("Đẩy đến khi tay duỗi thẳng khoảng 180° và siết tay sau 1 giây.", "Press until the arms reach about 180° and squeeze the triceps for 1 second.", elbowAngle),
        cue("Vai không đổ về trước đè lên thanh.", "The shoulders do not roll forward over the bar.", at("shoulder", undefined, [-16, 0]))
      ]],
      [t("Trả về", "Returning"), [bottom, top], [
        cue("Để tay lên chậm đến khi cẳng tay cao hơn mức song song sàn một chút (khuỷu khoảng 50–60°).", "Let the hands rise slowly until the forearms pass just above parallel (elbows about 50–60°).", elbowAngle),
        cue("Khuỷu vẫn đứng yên, không trôi lên theo dây.", "Elbows stay put and do not ride up with the cable.", at("elbow", undefined, [-16, 4])),
        cue("Thân giữ nguyên góc nghiêng.", "The torso keeps the same lean.", at("spine", undefined, [-18, 0]))
      ]]
    ],
    mistakes: [
      [t("Khuỷu trôi ra trước và lên trên", "Elbows drifting forward and up"), t("Ép khuỷu vào sườn; chỉ cẳng tay chuyển động.", "Pin the elbows to the ribs; only the forearms move."), { ...legs, torso: 82, arm: [-40, 70] }, top, ang("down", "shoulder", "elbow", [-18, 10])],
      [t("Đổ người đè lên thanh", "Leaning over the bar to push"), t("Giữ thân gần thẳng (nghiêng 5–10°); giảm tải.", "Keep the trunk near upright (5–10° lean); reduce the load."), { ...legs, torso: 55, arm: [-100, -95] }, bottom, ang("up", "hip", "shoulder", [-12, -8])]
    ]
  });
}

function overheadExtension(): ExerciseTechnique {
  const frame: Frame = { ...standing, box: [10, -46, 180, 206], grip: { kind: "dumbbell" } };
  const pose = (upper: number, fore: number, torso = 90): TechniquePose => ({ ...legs, torso, arm: [upper, fore] });
  const top = pose(86, 92);
  const bottom = pose(86, 205);
  return technique("overhead_triceps_extension", ["dumbbell"], frame, {
    setup: [top, [
      cue("Tay: hai tay ôm một đầu tạ, tay duỗi thẳng trên đầu.", "Hands: both hands cup one end of the dumbbell, arms straight overhead.", at("wrist", undefined, [14, 0])),
      cue("Khuỷu: hướng về trước, hai bắp tay sát tai.", "Elbows: pointing forward, upper arms close to the ears.", at("elbow", undefined, [14, 0])),
      cue("Thân: sườn hạ, gồng bụng, không ưỡn lưng.", "Trunk: ribs down, abs braced, no arch in the lower back.", at("spine", undefined, [-18, 0]))
    ]],
    phases: [
      [stepTitle.lower, [top, bottom], [
        cue("Hạ tạ ra sau đầu; cánh tay trên đứng yên thẳng đứng.", "Lower the weight behind the head; upper arms stay vertical and still.", ang("up", "shoulder", "elbow", [16, 6])),
        cue("Hạ đến khi khuỷu gập khoảng 60–70° và tay sau căng.", "Lower until the elbows close to about 60–70° and the triceps are stretched.", ang("shoulder", "elbow", "wrist", [-18, -8])),
        cue("Khuỷu không xòe sang hai bên.", "Elbows do not flare out to the sides.", at("elbow", undefined, [14, 0]))
      ]],
      [stepTitle.extend, [bottom, top], [
        cue("Duỗi khuỷu để đưa tạ thẳng lên trên đầu.", "Extend the elbows to bring the weight straight overhead.", at("wrist", 90, [14, 0])),
        cue("Kết thúc khi tay thẳng khoảng 180°.", "Finish with the arms straight at about 180°.", ang("shoulder", "elbow", "wrist", [16, 0])),
        cue("Sườn vẫn hạ, đầu không đẩy về trước.", "Ribs still down; the head does not push forward.", at("spine", undefined, [-18, 0]))
      ]]
    ],
    mistakes: [
      [t("Ưỡn lưng", "Arching the lower back"), t("Siết mông, hạ sườn; ngồi tựa ghế nếu vẫn ưỡn.", "Squeeze the glutes and pull the ribs down; sit against a back support if the arch remains."), { ...pose(100, 215, 104), round: -10 }, bottom, ang("up", "hip", "shoulder", [-10, -8])],
      [t("Cánh tay trên đổ về trước", "Upper arms dropping forward"), t("Giữ bắp tay sát tai, cánh tay trên thẳng đứng; chỉ khuỷu gập duỗi.", "Keep the upper arms by the ears and vertical; only the elbows bend and extend."), pose(48, 170), bottom, ang("up", "shoulder", "elbow", [16, 6])]
    ]
  });
}

function closeGripPress(): ExerciseTechnique {
  const frame: Frame = { view: "side", box: [30, 22, 160, 136], floor: 148, grip: { kind: "bar" }, pads: [[58, 104, 104, 7], [72, 111, 5, 37], [144, 111, 5, 37]] };
  const lying = { hip: [122, 97] as [number, number], torso: 180, leg: [-8, -98] as [number, number], foot: 0 };
  const top: TechniquePose = { ...lying, arm: [90, 90] };
  const bottom: TechniquePose = { ...lying, arm: [-30, 90] };
  return technique("triceps_press", ["barbell", "smith"], frame, {
    setup: [top, [
      cue("Tay: nắm rộng bằng vai (hẹp hơn đẩy ngực), cổ tay thẳng trên khuỷu.", "Hands: shoulder-width grip (narrower than a chest press), wrists straight over the elbows.", at("wrist", undefined, [-14, -4])),
      cue("Bả vai: khép về sau và hạ xuống, ngực nâng cao.", "Shoulder blades: back and down, chest lifted.", at("shoulder", -25, [-6, 24])),
      cue("Lưng và chân: mông, lưng trên chạm ghế; bàn chân chạm sàn dưới gối.", "Back and feet: glutes and upper back on the bench; feet flat under the knees.", ang("hip", "knee", "ankle", [-34, 16]))
    ]],
    phases: [
      [stepTitle.lower, [top, bottom], [
        cue("Khuỷu đi sát sườn, chỉ mở khoảng 20–30° so với thân.", "Elbows travel close to the ribs, only about 20–30° from the torso.", at("elbow", undefined, [-2, 22])),
        cue("Thanh đòn chạm phần ngực dưới, cẳng tay thẳng đứng 90°.", "The bar touches the lower chest with the forearms vertical at 90°.", ang("fwd", "elbow", "wrist", [12, 0])),
        cue("Cổ tay không gập ra sau.", "Wrists do not bend back.", at("wrist", undefined, [-14, -4]))
      ]],
      [stepTitle.press, [bottom, top], [
        cue("Đẩy bằng tay sau cho đến khi tay duỗi thẳng khoảng 180°.", "Drive with the triceps until the arms reach about 180°.", ang("shoulder", "elbow", "wrist", [12, 0])),
        cue("Thanh đòn kết thúc ngay trên vai.", "The bar finishes directly over the shoulders.", at("wrist", 115, [14, -4])),
        cue("Khuỷu vẫn hướng về phía chân, không xòe ra.", "Elbows keep pointing toward the feet, never flaring.", at("shoulder", undefined, [-10, 24]))
      ]]
    ],
    mistakes: [
      [t("Hạ tạ về phía cổ, khuỷu xòe", "Lowering toward the neck with flared elbows"), t("Khép khuỷu sát sườn và chạm tạ ở ngực dưới để cẳng tay thẳng đứng.", "Tuck the elbows to the ribs and touch the lower chest so the forearms stay vertical."), { ...lying, arm: [-14, 122] }, bottom, ang("fwd", "elbow", "wrist", [12, 0])],
      [t("Nhấc mông khỏi ghế", "Hips lifting off the bench"), t("Giữ mông chạm ghế; giảm tải nếu vẫn nhấc mông.", "Keep the glutes on the bench; reduce the load if the hips still lift."), { hip: [120, 84], torso: 197, leg: [-2, -92], foot: 0, arm: [-40, 90] }, bottom, at("hip", -90, [12, -14])]
    ]
  });
}

export const armTechniques: ExerciseTechnique[] = [
  curl("biceps_curl", "dumbbell", ["dumbbell"]),
  curl("biceps_curl", "bar", ["barbell"]),
  curl("hammer_curl", "dumbbell", ["dumbbell"]),
  pushdown(),
  overheadExtension(),
  closeGripPress()
];
