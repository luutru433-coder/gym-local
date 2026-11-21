import type { ExerciseTechnique, TechniquePose } from "@gym/contracts";
import { ang, at, cue, standing, stepTitle, t, technique } from "./shared";
import type { Frame } from "./shared";

const kneeAngle = (shift: [number, number] = [16, 0]) => ang("hip", "knee", "ankle", shift);

function legPress(): ExerciseTechnique {
  const frame: Frame = { view: "side", box: [6, 40, 160, 124], floor: 160, grip: { kind: "none" }, lines: [[78, 138, 24, 107]], pads: [[62, 138, 30, 6]] };
  const seat = { hip: [70, 128] as [number, number], torso: 150, arm: [-60, -20] as [number, number], foot: 125 };
  const pose = (foot: [number, number]): TechniquePose => ({ ...seat, leg: { to: foot, bend: 1 } });
  const top = pose([135, 86]);
  const bottom = pose([116, 100]);
  const plate = (x: number, y: number): Partial<Frame> => ({ lines: [[78, 138, 24, 107], [x + 8, y + 8, x - 6, y - 20]] });
  return technique("leg_press", ["machine"], frame, {
    setup: [top, [
      cue("Chân: đặt rộng bằng vai ở giữa bàn đạp, mũi chân xoay ra 10–20°, cả bàn chân áp sát.", "Feet: shoulder width in the middle of the platform, toes out 10–20°, whole foot flat.", at("ankle", undefined, [14, 6])),
      cue("Lưng: mông và lưng dưới ép sát đệm, gồng bụng.", "Back: glutes and lower back pressed into the pad, abs braced.", at("hip", undefined, [-4, -16])),
      cue("Tay: nắm tay cầm hai bên; gối chùng nhẹ, không khóa thẳng.", "Hands: hold the side handles; knees soft, never locked out.", kneeAngle([0, -16]))
    ], plate(135, 86)],
    phases: [
      [stepTitle.lower, [top, bottom], [
        cue("Hạ bàn đạp chậm trong 2–3 giây đến khi gối gập khoảng 90°.", "Lower the platform over 2–3 seconds until the knees reach about 90°.", kneeAngle([0, -16])),
        cue("Gối đi theo hướng mũi chân, không chụm vào trong.", "Knees track over the toes and do not cave in.", at("knee", 215, [12, 10])),
        cue("Mông không cuộn rời khỏi đệm.", "The hips do not curl off the pad.", at("hip", undefined, [-4, -16]))
      ]],
      [stepTitle.press, [bottom, top], [
        cue("Đạp bằng cả bàn chân, lực dồn giữa bàn chân và gót.", "Push through the whole foot, pressure on mid-foot and heel.", at("ankle", 35, [14, 6])),
        cue("Dừng khi gối còn chùng nhẹ khoảng 165–170°.", "Stop with the knees still soft at about 165–170°.", kneeAngle([0, -16])),
        cue("Tay không đẩy lên gối.", "The hands do not push on the knees.", at("wrist", undefined, [0, 14]))
      ]]
    ],
    mistakes: [
      [t("Hạ quá sâu, mông cuộn khỏi đệm", "Going too deep, hips curling off the pad"), t("Dừng ở độ sâu mà lưng dưới vẫn áp sát đệm (gối khoảng 90°).", "Stop at the depth where the lower back stays on the pad (knees about 90°)."), { ...pose([104, 104]), hip: [76, 122], round: 14 }, bottom, kneeAngle([0, -16])],
      [t("Khóa thẳng gối ở đỉnh", "Locking the knees at the top"), t("Giữ gối chùng nhẹ 165–170° để tải ở cơ đùi, không dồn lên khớp.", "Keep the knees soft at 165–170° so the load stays on the thighs, not the joint."), pose([138, 84]), top, kneeAngle([0, -16])]
    ]
  });
}

function splitStance(movementId: "split_squat" | "lunge", kind: "none" | "dumbbell", equipment: ExerciseTechnique["equipment"]): ExerciseTechnique {
  const lunge = movementId === "lunge";
  const frame: Frame = { ...standing, grip: { kind } };
  const pose = (hip: [number, number], torso = 86, front: [number, number] = [124, 150], back: [number, number] = [62, 140]): TechniquePose => ({ hip, torso, arm: [-90, -88], leg: { to: front, bend: 1 }, leg2: { to: back, bend: 1 }, foot: 0, foot2: -60 });
  const top = pose([94, 82]);
  const bottom = pose([94, 108]);
  const feetTogether = pose([98, 74], 88, [100, 150], [96, 150]);
  const start = lunge ? { ...feetTogether, foot2: 0 } : top;
  return technique(movementId, equipment, frame, {
    setup: [start, lunge ? [
      cue("Chân: đứng thẳng, hai chân rộng bằng hông, trọng tâm đều hai bàn chân.", "Feet: stand tall, feet hip width, weight even on both feet.", at("ankle", undefined, [16, -8])),
      cue("Thân: ngực mở, gồng bụng, mắt nhìn thẳng.", "Trunk: chest open, abs braced, eyes forward.", at("spine", undefined, [-18, 0])),
      cue(kind === "dumbbell" ? "Tay: tạ buông thẳng hai bên hông, vai hạ thấp." : "Tay: chống hông hoặc buông tự nhiên, vai hạ thấp.", kind === "dumbbell" ? "Hands: dumbbells hanging at the sides, shoulders down." : "Hands: on the hips or relaxed at the sides, shoulders down.", at("wrist", undefined, [16, 0]))
    ] : [
      cue("Chân: bước dài khoảng 2–2,5 bàn chân, hai chân trên hai đường ray rộng bằng hông.", "Feet: stance about 2–2.5 foot lengths long, feet on two rails hip width apart.", at("ankle", undefined, [14, -10])),
      cue("Chân sau: nhón trên mũi chân, gót nâng.", "Back foot: on the ball of the foot, heel lifted.", at("ankle2", undefined, [-14, -6])),
      cue("Thân: thẳng, hơi nghiêng trước 5–10°, hông vuông về trước.", "Trunk: tall with a 5–10° forward lean, hips square to the front.", ang("up", "hip", "shoulder", [-14, -8]))
    ]],
    phases: [
      [lunge ? t("Bước và hạ xuống", "Step and lower") : stepTitle.lower, [start, bottom], [
        cue(lunge ? "Bước dài ra trước rồi hạ thẳng xuống, gối trước khoảng 90°." : "Hạ thẳng xuống, gối trước gập khoảng 90°.", lunge ? "Take a long step forward, then drop straight down; front knee about 90°." : "Drop straight down until the front knee reaches about 90°.", kneeAngle([18, -6])),
        cue("Gối sau hạ gần chạm sàn, cách sàn khoảng 2–5 cm.", "The back knee lowers to about 2–5 cm above the floor.", at("knee2", -90, [-14, -8])),
        cue("Gối trước đi theo hướng mũi chân, gót trước không nhấc.", "The front knee tracks over the toes; the front heel stays down.", at("ankle", undefined, [14, -10]))
      ]],
      [lunge ? t("Đạp về", "Pushing back") : stepTitle.rise, [bottom, start], [
        cue(lunge ? "Đạp mạnh gót chân trước để trở về tư thế đứng." : "Đạp gót chân trước để đứng lên theo đường thẳng đứng.", lunge ? "Drive through the front heel to return to standing." : "Drive through the front heel and rise straight up.", at("hip", 90, [-16, 0])),
        cue("Thân giữ nguyên góc, không đổ về trước.", "The torso keeps its angle and does not tip forward.", ang("up", "hip", "shoulder", [-14, -8])),
        cue("Gối trước duỗi gần thẳng, không khóa.", "The front knee finishes nearly straight, not locked.", kneeAngle([18, -6]))
      ]]
    ],
    mistakes: [
      [t("Bước quá ngắn, gối vượt xa mũi chân và gót nhấc", "Stance too short: knee far past the toes, heel lifting"), t("Bước dài hơn để gối trước khoảng 90° và gót trước áp sàn.", "Lengthen the stance so the front knee is about 90° and the front heel stays down."), pose([84, 106], 86, [104, 150], [50, 140]), bottom, kneeAngle([18, -6])],
      [t("Đổ thân về trước", "Torso collapsing forward"), t("Giữ ngực mở, thân chỉ nghiêng 5–10°; giảm tải nếu cần.", "Keep the chest open with only a 5–10° lean; reduce the load if needed."), pose([94, 108], 52), bottom, ang("up", "hip", "shoulder", [-14, -8])]
    ]
  });
}

function hipThrust(loaded: boolean, equipment: ExerciseTechnique["equipment"]): ExerciseTechnique {
  const frame: Frame = { view: "side", box: [10, 40, 180, 124], floor: 155, grip: loaded ? { kind: "bar", at: "hip", offset: [2, -9], size: 11 } : { kind: "none" }, pads: [[30, 116, 34, 39]] };
  const pose = (hip: [number, number], torso: number, hand: [number, number], extra: Partial<TechniquePose> = {}): TechniquePose => ({ hip, torso, head: 30, arm: { to: hand, bend: -1 }, leg: { to: [144, 150], bend: 1 }, foot: 0, ...extra });
  const top = pose([106, 110], 180, [102, 102]);
  const bottom = pose([100, 132], 151, [98, 124]);
  const hipAngle = ang("shoulder", "hip", "knee", [0, -18]);
  return technique("hip_thrust", equipment, frame, {
    setup: [bottom, [
      cue("Lưng: mép ghế nằm ngay dưới xương bả vai.", "Back: the bench edge sits just under the shoulder blades.", at("shoulder", undefined, [0, -16])),
      cue("Chân: rộng bằng hông, đặt sao cho ở đỉnh ống chân thẳng đứng.", "Feet: hip width, placed so the shins are vertical at the top.", at("ankle", undefined, [14, -8])),
      cue(loaded ? "Tay: giữ thanh đòn ở nếp gập hông (lót đệm), cằm hơi thu." : "Tay: đặt trên hông hoặc ghế, cằm hơi thu.", loaded ? "Hands: steady the bar in the hip crease (use a pad), chin slightly tucked." : "Hands: on the hips or the bench, chin slightly tucked.", at("wrist", undefined, [10, -16]))
    ]],
    phases: [
      [stepTitle.press, [bottom, top], [
        cue("Đạp gót, đẩy hông lên đến khi vai–hông–gối thẳng hàng 180°.", "Drive through the heels until shoulders, hips and knees form a 180° line.", hipAngle),
        cue("Ở đỉnh gối gập khoảng 90°, ống chân thẳng đứng.", "At the top the knees are about 90° with vertical shins.", kneeAngle([16, -4])),
        cue("Siết mông 1 giây, sườn hạ, cằm thu.", "Squeeze the glutes for 1 second, ribs down, chin tucked.", at("spine", undefined, [0, 16]))
      ]],
      [stepTitle.lower, [top, bottom], [
        cue("Hạ hông chậm trong 2 giây, thân xoay quanh mép ghế.", "Lower the hips over 2 seconds, pivoting on the bench edge.", at("hip", -90, [14, 10])),
        cue("Gối không chụm vào trong.", "Knees do not cave in.", at("knee", undefined, [14, 0])),
        cue("Dừng ngay trước khi mông chạm sàn rồi đẩy tiếp.", "Stop just before the glutes touch the floor, then drive again.", hipAngle)
      ]]
    ],
    mistakes: [
      [t("Ưỡn lưng để lên cao hơn", "Arching the back to get higher"), t("Dừng ở 180°, sườn hạ và cằm thu; lên cao hơn là do lưng, không phải mông.", "Stop at 180° with ribs down and chin tucked; extra height comes from the back, not the glutes."), pose([108, 98], 176, [104, 90], { round: -16, head: -10 }), top, hipAngle],
      [t("Không duỗi hết hông", "Stopping short of full hip extension"), t("Đẩy đến khi thân song song sàn; giảm tải nếu chưa tới.", "Drive until the torso is parallel to the floor; reduce the load if you cannot reach it."), pose([103, 122], 165, [100, 114]), top, hipAngle],
      [t("Chân đặt quá xa", "Feet too far away"), t("Kéo chân lại gần để gối khoảng 90° ở đỉnh; xa quá sẽ dồn sang đùi sau.", "Bring the feet in so the knees are about 90° at the top; too far shifts the work to the hamstrings."), { ...top, leg: { to: [170, 150], bend: 1 } }, top, kneeAngle([16, -4])]
    ]
  });
}

function legCurl(): ExerciseTechnique {
  const frame: Frame = { view: "side", box: [14, 46, 172, 112], floor: 154, grip: { kind: "none" }, pads: [[44, 116, 92, 7], [60, 123, 5, 31], [118, 123, 5, 31]] };
  const pose = (shin: number, extra: Partial<TechniquePose> = {}): TechniquePose => ({ hip: [96, 108], torso: 180, head: -25, arm: [-150, 180], leg: [-2, shin], foot: shin + 90, ...extra });
  const straight = pose(-6);
  const curled = pose(112);
  return technique("leg_curl", ["machine"], frame, {
    setup: [straight, [
      cue("Gối: nằm sấp, gối ngay ngoài mép đệm và thẳng trục xoay của máy.", "Knees: lie face down with the knees just off the pad edge, in line with the machine's pivot.", at("knee", undefined, [0, 16])),
      cue("Đệm chân: tì trên gân gót, ngay trên gót chân.", "Leg pad: resting on the Achilles, just above the heels.", at("ankle", undefined, [0, -14])),
      cue("Hông và tay: hông ép xuống đệm, tay nắm tay cầm.", "Hips and hands: hips pressed into the pad, hands on the handles.", at("hip", -90, [0, -18]))
    ]],
    phases: [
      [stepTitle.curl, [straight, curled], [
        cue("Cuốn gót về phía mông đến khi gối gập khoảng 60–70°.", "Curl the heels toward the glutes until the knees close to about 60–70°.", kneeAngle([-6, -22])),
        cue("Hông vẫn ép xuống đệm.", "Hips stay pressed into the pad.", at("hip", undefined, [0, -18])),
        cue("Siết đùi sau 1 giây ở đỉnh.", "Squeeze the hamstrings for 1 second at the top.", at("ankle", undefined, [14, 0]))
      ]],
      [stepTitle.lower, [curled, straight], [
        cue("Hạ chậm trong 2–3 giây.", "Lower over 2–3 seconds.", at("ankle", 0, [0, -14])),
        cue("Duỗi gần hết, khoảng 170°, không thả rơi tạ.", "Extend to about 170° without letting the stack drop.", kneeAngle([0, -16])),
        cue("Lưng dưới không ưỡn.", "The lower back does not arch.", at("spine", undefined, [0, -16]))
      ]]
    ],
    mistakes: [
      [t("Nhấc hông để giật tạ", "Hips lifting to heave the weight"), t("Ép hông xuống đệm và giảm tải.", "Press the hips into the pad and reduce the load."), pose(112, { hip: [96, 98], torso: 168, leg: [-18, 100], foot: 190 }), curled, at("hip", -90, [0, -18])],
      [t("Chỉ cuốn nửa đường", "Half range"), t("Cuốn đến khi gối gập ít nhất 70°, rồi duỗi gần hết.", "Curl until the knees close to at least 70°, then extend almost fully."), pose(50), curled, kneeAngle([-6, -22])]
    ]
  });
}

function legExtension(): ExerciseTechnique {
  const frame: Frame = { view: "side", box: [20, 30, 160, 130], floor: 156, grip: { kind: "none" }, lines: [[72, 108, 62, 58]], pads: [[66, 108, 50, 7], [86, 115, 6, 41]] };
  const pose = (shin: number, extra: Partial<TechniquePose> = {}): TechniquePose => ({ hip: [80, 102], torso: 100, arm: [-80, -10], leg: [0, shin], foot: shin + 90, ...extra });
  const bent = pose(-100);
  const straight = pose(-6);
  return technique("leg_extension", ["machine"], frame, {
    setup: [bent, [
      cue("Gối: khớp gối thẳng trục xoay của máy, khoeo chân sát mép ghế.", "Knees: knee joint in line with the machine's pivot, back of the knees at the seat edge.", at("knee", undefined, [10, -14])),
      cue("Đệm chân: tì ngay trên cổ chân, không tì lên bàn chân.", "Leg pad: just above the ankles, not on the feet.", at("ankle", undefined, [14, 0])),
      cue("Lưng và tay: lưng tựa sát đệm, tay nắm tay cầm cạnh ghế.", "Back and hands: back against the pad, hands on the seat handles.", at("spine", undefined, [14, -4]))
    ]],
    phases: [
      [stepTitle.extend, [bent, straight], [
        cue("Duỗi gối đến khi chân gần thẳng, khoảng 170–175°.", "Extend until the legs are nearly straight, about 170–175°.", kneeAngle([0, -16])),
        cue("Siết đùi trước 1 giây ở đỉnh.", "Squeeze the quads for 1 second at the top.", at("ankle", 90, [10, 14])),
        cue("Mông không rời ghế.", "The hips do not leave the seat.", at("hip", undefined, [-14, 10]))
      ]],
      [stepTitle.lower, [straight, bent], [
        cue("Hạ chậm trong 2–3 giây.", "Lower over 2–3 seconds.", at("ankle", -90, [14, 0])),
        cue("Dừng khi gối gập khoảng 90°, tạ không chạm chồng tạ.", "Stop at about 90° of knee bend, before the plates touch the stack.", kneeAngle([14, -12])),
        cue("Lưng vẫn tựa sát đệm.", "The back stays against the pad.", at("spine", undefined, [14, -4]))
      ]]
    ],
    mistakes: [
      [t("Đá văng tạ, nhấc mông", "Kicking the weight and lifting the hips"), t("Giảm tải, nắm tay cầm, duỗi trong 1–2 giây.", "Reduce the load, hold the handles and extend over 1–2 seconds."), pose(4, { hip: [84, 96], torso: 116, leg: [-10, 4] }), straight, at("hip", -90, [-14, 10])],
      [t("Không duỗi hết", "Stopping short of extension"), t("Duỗi đến khoảng 170°; giảm tải nếu chưa tới.", "Extend to about 170°; reduce the load if you cannot reach it."), pose(-45), straight, kneeAngle([0, -16])]
    ]
  });
}

function calfRaise(): ExerciseTechnique {
  const frame: Frame = { ...standing, box: [10, -22, 180, 190], floor: 164, grip: { kind: "none" }, pads: [[84, 152, 34, 12]] };
  const pose = (foot: number, leg: [number, number] = [-90, -90]): TechniquePose => ({ pin: ["toe", 108, 150], torso: 90, arm: [-88, -80], leg, foot });
  const low = pose(16);
  const high = pose(-36);
  const ankle = ang("knee", "ankle", "toe", [18, 0]);
  return technique("standing_calf_raise", ["bodyweight", "dumbbell", "machine"], frame, {
    setup: [pose(0), [
      cue("Chân: phần ụ ngón chân đặt trên mép bục, gót treo ngoài, hai chân rộng bằng hông.", "Feet: balls of the feet on the edge of a step, heels hanging off, feet hip width.", at("toe", undefined, [14, -8])),
      cue("Gối: thẳng nhưng không khóa cứng.", "Knees: straight but not locked hard.", at("knee", undefined, [16, 0])),
      cue("Thân và tay: đứng thẳng, tay vịn nhẹ để giữ thăng bằng.", "Trunk and hands: stand tall, hands lightly on a support for balance.", at("spine", undefined, [-18, 0]))
    ]],
    phases: [
      [stepTitle.raise, [low, high], [
        cue("Nhón lên cao hết mức trên ụ ngón cái.", "Rise as high as possible onto the ball of the big toe.", at("ankle", 90, [-16, 0])),
        cue("Cổ chân duỗi hết, giữ 1 giây ở đỉnh.", "Ankles fully extended; hold 1 second at the top.", ankle),
        cue("Gối giữ thẳng, không nhún gối để lấy đà.", "Knees stay straight; no knee dip for momentum.", at("knee", undefined, [16, 0]))
      ]],
      [stepTitle.lower, [high, low], [
        cue("Hạ gót chậm trong 2–3 giây xuống thấp hơn mặt bục.", "Lower the heels over 2–3 seconds to below the step.", at("ankle", -90, [-16, 0])),
        cue("Dừng 1 giây ở điểm căng dưới cùng, không nảy.", "Pause 1 second in the bottom stretch; no bounce.", ankle),
        cue("Cổ chân không đổ ra ngoài.", "Ankles do not roll outward.", at("toe", undefined, [14, -8]))
      ]]
    ],
    mistakes: [
      [t("Nhón nửa chừng và nảy", "Short, bouncy reps"), t("Đi hết biên độ: gót dưới mặt bục, rồi nhón cao hết mức và dừng 1 giây.", "Use the full range: heels below the step, then all the way up with a 1-second pause."), pose(-12), high, ankle],
      [t("Gập gối để lấy đà", "Bending the knees for momentum"), t("Giữ gối thẳng để bắp chân làm việc; giảm tải.", "Keep the knees straight so the calves do the work; reduce the load."), pose(-30, [-70, -108]), high, kneeAngle([18, 0])]
    ]
  });
}

function plank(): ExerciseTechnique {
  const frame: Frame = { view: "side", box: [10, 56, 180, 108], floor: 157, grip: { kind: "none" } };
  const body = (lean: number, extra: Partial<TechniquePose> = {}): TechniquePose => ({ pin: ["toe", 26, 152], torso: lean, leg: [180 + lean, 180 + lean], foot: -90, arm: [-90, 0], ...extra });
  const hold = body(11);
  const line = ang("shoulder", "hip", "knee", [0, -16]);
  return technique("plank", ["bodyweight"], frame, {
    setup: [hold, [
      cue("Tay: khuỷu ngay dưới vai, cẳng tay song song, khuỷu gập 90°.", "Arms: elbows directly under the shoulders, forearms parallel, elbows at 90°.", ang("shoulder", "elbow", "wrist", [-20, -4])),
      cue("Chân: rộng bằng hông, nhón trên mũi chân, gối duỗi thẳng.", "Feet: hip width, on the toes, knees straight.", at("ankle", undefined, [4, -16])),
      cue("Bả vai: đẩy sàn ra xa, không để ngực võng giữa hai vai.", "Shoulder blades: push the floor away so the chest does not sink between the shoulders.", at("shoulder", 90, [14, -10]))
    ]],
    phases: [
      [stepTitle.hold, [hold], [
        cue("Đầu, vai, hông, gót thành một đường thẳng 180°.", "Head, shoulders, hips and heels in one 180° line.", line),
        cue("Siết mông và gồng bụng như sắp bị đấm vào bụng.", "Squeeze the glutes and brace as if about to be punched in the stomach.", at("spine", undefined, [0, 16])),
        cue("Cổ thẳng, mắt nhìn xuống sàn; dừng khi không còn giữ được đường thẳng.", "Neck long, eyes on the floor; stop when the line can no longer be held.", at("head", undefined, [8, -18]))
      ]]
    ],
    mistakes: [
      [t("Võng hông", "Hips sagging"), t("Siết mông, cuộn nhẹ xương chậu; chống gối nếu chưa giữ được.", "Squeeze the glutes and tuck the pelvis slightly; drop to the knees if you cannot hold it."), body(3, { torso: 24, round: -10 }), hold, line],
      [t("Chổng mông", "Hips piked up"), t("Hạ hông về thẳng hàng vai và gót.", "Lower the hips in line with shoulders and heels."), body(28, { torso: -8 }), hold, line]
    ]
  });
}

function crunch(): ExerciseTechnique {
  const frame: Frame = { view: "side", box: [14, 62, 172, 100], floor: 150, grip: { kind: "none" } };
  const pose = (torso: number, round: number, extra: Partial<TechniquePose> = {}): TechniquePose => ({ hip: [104, 142], torso, round, head: 0, arm: [torso - 150, torso - 20], leg: [45, -45], foot: 0, ...extra });
  const down = pose(180, 0);
  const up = pose(165, 15);
  const curl = ang("hip", "spine", "shoulder", [0, -16]);
  return technique("crunch", ["bodyweight"], frame, {
    setup: [down, [
      cue("Chân: gối gập khoảng 90°, bàn chân áp sàn rộng bằng hông.", "Feet: knees bent about 90°, feet flat and hip width apart.", kneeAngle([10, -14])),
      cue("Lưng: lưng dưới ép nhẹ xuống sàn.", "Back: lower back pressed lightly into the floor.", at("hip", -90, [-14, -16])),
      cue("Tay: bắt chéo trước ngực hoặc đầu ngón tay chạm nhẹ sau tai; cằm cách ngực một nắm tay.", "Hands: crossed on the chest or fingertips lightly behind the ears; chin a fist away from the chest.", at("wrist", undefined, [0, -16]))
    ]],
    phases: [
      [stepTitle.curl, [down, up], [
        cue("Cuộn sườn về phía xương chậu, nhấc bả vai khỏi sàn khoảng 30°.", "Curl the ribs toward the pelvis, lifting the shoulder blades about 30° off the floor.", ang("back", "spine", "shoulder", [-4, -18])),
        cue("Lưng dưới vẫn chạm sàn.", "The lower back stays on the floor.", at("hip", undefined, [-14, -16])),
        cue("Thở ra và siết bụng 1 giây ở đỉnh.", "Exhale and squeeze the abs for 1 second at the top.", at("spine", undefined, [10, 14]))
      ]],
      [stepTitle.lower, [up, down], [
        cue("Hạ chậm trong 2 giây, từng đốt sống một.", "Lower over 2 seconds, one vertebra at a time.", at("shoulder", -90, [0, -18])),
        cue("Giữ bụng căng, đầu không rơi phịch xuống sàn.", "Keep the abs tight; the head does not drop to the floor.", at("head", undefined, [0, -18])),
        cue("Lưng dưới vẫn ép sàn trước rep tiếp theo.", "The lower back is still down before the next rep.", curl)
      ]]
    ],
    mistakes: [
      [t("Kéo cổ bằng tay", "Pulling on the neck"), t("Tay chỉ chạm nhẹ; giữ cằm cách ngực một nắm tay và cuộn bằng bụng.", "Hands only touch lightly; keep the chin a fist from the chest and curl with the abs."), pose(165, 15, { head: -45 }), up, at("head", undefined, [0, -18])],
      [t("Ngồi hẳn dậy", "Sitting all the way up"), t("Chỉ nhấc bả vai khoảng 30°; ngồi hẳn dậy chuyển tải sang cơ gập hông.", "Lift the shoulder blades only about 30°; sitting up shifts the work to the hip flexors."), pose(118, 4), up, ang("back", "hip", "shoulder", [-4, -18])]
    ]
  });
}

export const lowerTechniques: ExerciseTechnique[] = [
  legPress(),
  splitStance("split_squat", "none", ["bodyweight"]),
  splitStance("split_squat", "dumbbell", ["dumbbell"]),
  splitStance("lunge", "none", ["bodyweight"]),
  splitStance("lunge", "dumbbell", ["dumbbell"]),
  hipThrust(true, ["barbell", "smith"]),
  hipThrust(false, ["bodyweight"]),
  legCurl(),
  legExtension(),
  calfRaise(),
  plank(),
  crunch()
];
