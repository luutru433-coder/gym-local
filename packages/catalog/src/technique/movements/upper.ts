import type { ExerciseTechnique, TechniquePose } from "@gym/contracts";
import { ang, at, cue, onFloor, standing, stepTitle, t, technique } from "./shared";
import type { Frame } from "./shared";

function inclinePress(kind: "bar" | "dumbbell", equipment: ExerciseTechnique["equipment"]): ExerciseTechnique {
  const frame: Frame = { view: "side", box: [26, 6, 160, 158], floor: 158, grip: { kind }, lines: [[127, 123, 68, 89]], pads: [[120, 121, 34, 6], [92, 126, 5, 31], [140, 126, 5, 31]] };
  const lying = { hip: [120, 110] as [number, number], torso: 150, leg: [-6, -96] as [number, number], foot: 0 };
  const top: TechniquePose = { ...lying, arm: [90, 90] };
  const bottom: TechniquePose = { ...lying, arm: [-38, 90] };
  const steep = { ...lying, torso: 118 };
  return technique("incline_chest_press", equipment, frame, {
    setup: [top, [
      cue("Ghế: dốc 30–45°; dốc hơn nữa sẽ chuyển tải sang vai trước.", "Bench: set to 30–45°; steeper shifts the work to the front delts.", ang("back", "hip", "shoulder", [-4, 14])),
      cue("Bả vai: khép về sau và hạ xuống, ngực nâng cao, mông và lưng trên chạm ghế.", "Shoulder blades: back and down, chest lifted, glutes and upper back on the bench.", at("shoulder", -40, [-12, 10])),
      cue(kind === "bar" ? "Tay: nắm rộng khoảng 1,5 lần vai, cổ tay thẳng trên khuỷu." : "Tay: tạ ở trên vai, cổ tay thẳng trên khuỷu.", kind === "bar" ? "Hands: grip about 1.5× shoulder width, wrists straight over the elbows." : "Hands: dumbbells above the shoulders, wrists straight over the elbows.", at("wrist", undefined, [14, 0])),
      cue("Chân: cả bàn chân chạm sàn, gối gập khoảng 90°.", "Feet: flat on the floor, knees bent about 90°.", ang("hip", "knee", "ankle", [10, -8]))
    ]],
    phases: [
      [stepTitle.lower, [top, bottom], [
        cue("Hạ tạ xuống ngực trên, ngay dưới xương đòn.", "Lower to the upper chest, just below the collarbone.", at("wrist", -90, [14, 0])),
        cue("Cẳng tay luôn thẳng đứng 90° so với sàn.", "Forearms stay vertical, 90° to the floor.", ang("fwd", "elbow", "wrist", [14, 0])),
        cue("Khuỷu mở khoảng 45–60° so với thân, không xòe ngang vai.", "Elbows about 45–60° from the torso, not flared to shoulder level.", at("elbow", undefined, [0, 14]))
      ]],
      [stepTitle.press, [bottom, top], [
        cue("Đẩy thẳng lên, kết thúc với tạ ngay trên khớp vai.", "Press straight up and finish with the weight over the shoulder joint.", at("wrist", 90, [14, 0])),
        cue("Tay duỗi gần thẳng khoảng 170–180°.", "Arms finish almost straight, about 170–180°.", ang("shoulder", "elbow", "wrist", [14, 0])),
        cue("Bả vai vẫn ép vào ghế, không đẩy vai ra trước.", "Shoulder blades stay pinned to the bench; no reaching forward.", at("shoulder", undefined, [-14, 8]))
      ]]
    ],
    mistakes: [
      [t("Ghế dốc quá cao", "Bench set too steep"), t("Hạ ghế về 30–45° để ngực trên làm việc thay vì vai.", "Drop the bench to 30–45° so the upper chest works instead of the shoulders."), { ...steep, arm: [-70, 90] }, bottom, ang("back", "hip", "shoulder", [-4, 14]), { lines: [] }],
      [t("Hạ tạ quá thấp về phía bụng, cẳng tay nghiêng", "Lowering toward the belly with tilted forearms"), t("Chạm tạ ở ngực trên để cẳng tay thẳng đứng 90°.", "Touch the upper chest so the forearms stay vertical at 90°."), { ...lying, arm: [-20, 58] }, bottom, ang("fwd", "elbow", "wrist", [14, 0])]
    ]
  });
}

function chestFly(): ExerciseTechnique {
  const frame: Frame = { view: "top", box: [14, 26, 172, 132], pads: [[84, 34, 32, 92]], grip: { kind: "dumbbell" } };
  const above = { hip: [100, 112] as [number, number], torso: 90, leg: [-78, -80] as [number, number], foot: -75 };
  const pose = (arm: [number, number], reach: number): TechniquePose => ({ ...above, arm, scale: { upper: reach, fore: reach, shin: 0.6 } });
  const open = pose([-6, 14], 1);
  const closed = pose([-6, 14], 0.25);
  return technique("chest_fly", ["dumbbell"], frame, {
    setup: [closed, [
      cue("Tay: hai tạ ở trên ngực, lòng bàn tay hướng vào nhau, khuỷu chùng nhẹ.", "Hands: dumbbells above the chest, palms facing each other, elbows slightly bent.", at("wrist", undefined, [16, -8])),
      cue("Bả vai: khép về sau và hạ xuống ghế trước khi mở tay.", "Shoulder blades: back and down against the bench before opening the arms.", at("shoulder", -90, [0, 16])),
      cue("Lưng và chân: mông, lưng trên chạm ghế; bàn chân chạm sàn.", "Back and feet: glutes and upper back on the bench; feet flat on the floor.", at("hip"))
    ]],
    phases: [
      [t("Mở tay", "Opening"), [closed, open], [
        cue("Mở tay theo hình vòng cung ngang ngực, khuỷu giữ gập cố định khoảng 15–20°.", "Open in a wide arc level with the chest, elbows fixed at a 15–20° bend.", ang("shoulder1", "elbow", "wrist", [0, 14])),
        cue("Dừng khi cánh tay ngang thân ghế, không để khuỷu tụt sâu dưới vai.", "Stop when the upper arms are level with the bench; elbows never sink far below the shoulders.", at("elbow2", undefined, [0, -14])),
        cue("Vai vẫn hạ thấp, ngực mở.", "Shoulders stay down, chest open.", at("shoulder", undefined, [0, 16]))
      ]],
      [t("Khép tay", "Closing"), [open, closed], [
        cue("Khép tay như ôm một thân cây lớn, góc khuỷu không đổi.", "Close as if hugging a large tree; the elbow angle does not change.", at("wrist", 180, [0, -14])),
        cue("Dừng khi tạ ở trên ngực, không đập hai tạ vào nhau.", "Stop with the weights above the chest; do not bang them together.", at("wrist2", undefined, [0, 14])),
        cue("Bả vai vẫn ép xuống ghế.", "Shoulder blades stay pinned to the bench.", at("shoulder", undefined, [0, 16]))
      ]]
    ],
    mistakes: [
      [t("Gập khuỷu thành động tác đẩy", "Bending the elbows into a press"), t("Giữ khuỷu chùng 15–20° cố định; giảm tải nếu phải gập thêm.", "Keep a fixed 15–20° elbow bend; reduce the load if you have to bend more."), pose([-25, 85], 1), open, ang("shoulder1", "elbow", "wrist", [0, 14])],
      [t("Khóa thẳng khuỷu", "Locking the elbows straight"), t("Chùng nhẹ khuỷu để giảm áp lực lên khớp khuỷu và gân nhị đầu.", "Unlock the elbows slightly to take stress off the joint and the biceps tendon."), pose([0, 0], 1), open, ang("shoulder1", "elbow", "wrist", [0, 14])]
    ]
  });
}

function pushUp(): ExerciseTechnique {
  const frame: Frame = { view: "side", box: [10, 40, 180, 124], floor: 157, grip: { kind: "none" } };
  const hand: [number, number] = [147, 151];
  const body = (lean: number, extra: Partial<TechniquePose> = {}): TechniquePose => ({ pin: ["toe", 26, 152], torso: lean, leg: [180 + lean, 180 + lean], foot: -90, arm: { to: hand, bend: -1 }, ...extra });
  const top = body(18.7);
  const bottom = body(5);
  return technique("push_up", ["bodyweight"], frame, {
    setup: [top, [
      cue("Tay: đặt dưới vai, rộng hơn vai một chút, các ngón tay hướng về trước.", "Hands: under the shoulders, slightly wider than shoulder width, fingers pointing forward.", at("wrist", undefined, [14, -8])),
      cue("Thân: đầu, vai, hông, gót thành một đường thẳng 180°; siết mông và bụng.", "Body: head, shoulders, hips and heels in one 180° line; glutes and abs tight.", ang("shoulder", "hip", "knee", [0, -14])),
      cue("Bả vai: đẩy sàn ra xa, vai không nhún lên tai.", "Shoulder blades: push the floor away, shoulders away from the ears.", at("shoulder", undefined, [10, -12]))
    ]],
    phases: [
      [stepTitle.lower, [top, bottom], [
        cue("Khuỷu hướng về sau khoảng 45° so với thân, không xòe ngang.", "Elbows point back at about 45° from the torso, not straight out.", at("elbow", 200, [0, -14])),
        cue("Cả thân hạ xuống cùng lúc như một tấm ván.", "The whole body lowers together like a plank.", ang("shoulder", "hip", "knee", [0, -14])),
        cue("Dừng khi ngực cách sàn khoảng một nắm tay, khuỷu khép còn khoảng 50–70°.", "Stop with the chest about a fist from the floor, elbows closed to about 50–70°.", ang("shoulder", "elbow", "wrist", [-22, 6]))
      ]],
      [stepTitle.press, [bottom, top], [
        cue("Đẩy sàn ra xa, hông và vai lên cùng lúc.", "Push the floor away; hips and shoulders rise together.", at("shoulder", 90, [12, 0])),
        cue("Duỗi thẳng tay ở đỉnh, khoảng 170–180°.", "Straighten the arms at the top, about 170–180°.", ang("shoulder", "elbow", "wrist", [-24, 4])),
        cue("Hông không võng, không chổng lên.", "Hips neither sag nor pike.", at("hip", undefined, [0, -14]))
      ]]
    ],
    mistakes: [
      [t("Võng hông", "Hips sagging"), t("Siết mông và bụng để giữ thân thẳng 180°; kê tay lên cao nếu chưa giữ được.", "Squeeze glutes and abs to hold a 180° line; elevate the hands if you cannot hold it."), body(4, { torso: 26, round: -10 }), top, ang("shoulder", "hip", "knee", [0, -14])],
      [t("Chổng mông", "Hips piked up"), t("Hạ hông về thẳng hàng vai và gót.", "Bring the hips down in line with shoulders and heels."), body(32, { torso: -2 }), top, ang("shoulder", "hip", "knee", [0, -14])],
      [t("Hạ nửa chừng", "Half depth"), t("Hạ đến khi khuỷu khép còn khoảng 50–70°; kê tay lên cao nếu chưa đủ sức.", "Lower until the elbows close to about 50–70°; elevate the hands if strength is missing."), body(12), bottom, ang("shoulder", "elbow", "wrist", [-22, 6])]
    ]
  });
}

function dip(): ExerciseTechnique {
  const frame: Frame = { view: "side", box: [16, 0, 168, 176], lines: [[66, 100, 134, 100]], grip: { kind: "none" } };
  const body = (hip: [number, number], torso: number): TechniquePose => ({ hip, torso, leg: [-92, -165], foot: 180, arm: { to: [100, 96], bend: -1 } });
  const top = body([92, 89.3], 79);
  const bottom = body([84, 102], 68);
  return technique("dip", ["bodyweight"], frame, {
    setup: [top, [
      cue("Tay: nắm hai thanh rộng hơn vai một chút, tay duỗi thẳng, cổ tay ngay dưới vai.", "Hands: bars slightly wider than the shoulders, arms straight, wrists directly under the shoulders.", at("wrist", undefined, [14, 8])),
      cue("Bả vai: hạ vai xuống xa tai, ngực mở.", "Shoulder blades: shoulders pressed down away from the ears, chest open.", at("shoulder", -90, [14, -6])),
      cue("Thân và chân: nghiêng nhẹ về trước 10–15°, gập gối ra sau, không vung.", "Trunk and legs: lean forward 10–15°, knees bent behind you, no swinging.", ang("up", "hip", "shoulder", [-12, -8]))
    ]],
    phases: [
      [stepTitle.lower, [top, bottom], [
        cue("Khuỷu gập thẳng ra sau, cẳng tay gần thẳng đứng.", "Elbows bend straight back, forearms near vertical.", ang("up", "wrist", "elbow", [14, 0])),
        cue("Dừng khi cánh tay song song sàn, khuỷu khoảng 90°.", "Stop when the upper arms are parallel to the floor, elbows at about 90°.", ang("shoulder", "elbow", "wrist", [-22, 0])),
        cue("Thân nghiêng về trước khoảng 20–30° để ngực làm việc.", "Torso leans forward about 20–30° so the chest works.", at("spine", undefined, [14, 0]))
      ]],
      [stepTitle.press, [bottom, top], [
        cue("Đẩy thẳng xuống hai thanh cho đến khi tay duỗi thẳng khoảng 170–180°.", "Press straight down into the bars until the arms reach about 170–180°.", ang("shoulder", "elbow", "wrist", [-22, 0])),
        cue("Vai vẫn xa tai, không nhún vai ở đỉnh.", "Shoulders stay away from the ears; no shrug at the top.", at("shoulder", undefined, [14, -6])),
        cue("Chân không đá để lấy đà.", "No kicking the legs for momentum.", at("knee", undefined, [14, 0]))
      ]]
    ],
    mistakes: [
      [t("Hạ quá sâu, vai tụt dưới khuỷu", "Going too deep, shoulders below the elbows"), t("Dừng khi cánh tay song song sàn (khuỷu khoảng 90°).", "Stop when the upper arms are parallel to the floor (elbows about 90°)."), body([84, 116], 66), bottom, ang("shoulder", "elbow", "wrist", [-22, 0])],
      [t("Chỉ hạ nửa chừng", "Cutting the depth short"), t("Hạ đến khi khuỷu gập 90°; dùng dây trợ lực nếu chưa đủ sức.", "Lower until the elbows reach 90°; use band assistance if strength is missing."), body([90, 95], 77), bottom, ang("shoulder", "elbow", "wrist", [-22, 0])]
    ]
  });
}

function oneArmRow(): ExerciseTechnique {
  const frame: Frame = { ...standing, box: [10, 18, 180, 142], grip: { kind: "dumbbell" }, pads: [[84, 122, 84, 7], [92, 129, 5, 26], [156, 129, 5, 26]] };
  const base = { ...onFloor(70), leg: [-80, -94] as [number, number], leg2: [-72, 172] as [number, number], foot2: 180, arm2: [-88, -90] as [number, number] };
  const hang: TechniquePose = { ...base, torso: 8, arm: [-92, -90] };
  const top: TechniquePose = { ...base, torso: 8, arm: [-202, -112] };
  return technique("one_arm_row", ["dumbbell"], frame, {
    setup: [hang, [
      cue("Tay và gối chống: bàn tay ngay dưới vai, gối ngay dưới hông trên ghế.", "Support hand and knee: hand directly under the shoulder, knee directly under the hip on the bench.", at("wrist2", undefined, [14, -8])),
      cue("Lưng: phẳng, gần song song sàn (0–15°), hai vai và hai hông ngang nhau.", "Back: flat and close to parallel with the floor (0–15°), shoulders and hips level.", ang("fwd", "hip", "shoulder", [0, -14])),
      cue("Chân trụ: đặt hơi rộng ra ngoài, gối chùng nhẹ.", "Standing leg: set slightly out to the side, knee soft.", at("knee", undefined, [-14, 0]))
    ]],
    phases: [
      [stepTitle.pull, [hang, top], [
        cue("Kéo khuỷu về phía túi quần sau, khuỷu sát sườn.", "Pull the elbow toward the back pocket, close to the ribs.", at("elbow", 150, [0, 14])),
        cue("Kết thúc khi khuỷu cao hơn lưng một chút, khuỷu gập khoảng 90°.", "Finish with the elbow slightly above the back, bent to about 90°.", ang("shoulder", "elbow", "wrist", [-8, -12])),
        cue("Thân không xoay mở lên để kéo cao hơn.", "The torso does not rotate open to pull higher.", at("spine", undefined, [0, -14]))
      ]],
      [stepTitle.lower, [top, hang], [
        cue("Hạ tạ đến khi tay duỗi thẳng 180° và bả vai được kéo giãn.", "Lower until the arm is straight at 180° and the shoulder blade is stretched.", ang("shoulder", "elbow", "wrist", [14, 0])),
        cue("Vai không rơi về phía sàn, lưng vẫn phẳng.", "The shoulder does not drop toward the floor; the back stays flat.", at("shoulder", undefined, [10, -12])),
        cue("Tạ đi theo đường thẳng đứng dưới vai.", "The weight travels in a vertical line under the shoulder.", at("wrist", -90, [14, 0]))
      ]]
    ],
    mistakes: [
      [t("Kéo tạ về vai, khuỷu xòe ra", "Pulling to the shoulder with the elbow flared"), t("Kéo khuỷu về phía hông để tạ kết thúc cạnh sườn dưới.", "Drive the elbow toward the hip so the weight finishes beside the lower ribs."), { ...base, torso: 8, arm: [-240, -120] }, top, at("elbow", undefined, [0, -14])],
      [t("Dựng người lên để giật tạ", "Lifting the torso to heave the weight"), t("Giữ lưng gần song song sàn; giảm tải nếu phải giật.", "Keep the back near parallel to the floor; reduce the load if you have to heave."), { ...base, torso: 32, arm: [-195, -105], arm2: { to: [124, 120] } }, top, ang("fwd", "hip", "shoulder", [0, -14])]
    ]
  });
}

function facePull(): ExerciseTechnique {
  const frame: Frame = { ...standing, grip: { kind: "handle" }, cable: [188, 38] };
  const legs = { ...onFloor(84), leg: [-89, -91] as [number, number] };
  const pose = (torso: number, arm: [number, number], upper: number): TechniquePose => ({ ...legs, torso, arm, scale: { upper } });
  const start = pose(92, [10, 8], 1);
  const end = pose(92, [165, 72], 0.75);
  return technique("face_pull", ["cable", "resistance_band"], frame, {
    setup: [start, [
      cue("Dây: đặt ròng rọc ngang mắt hoặc cao hơn một chút.", "Cable: set the pulley at eye level or slightly above.", at("wrist", undefined, [10, -14])),
      cue("Tay: nắm hai đầu dây, ngón cái hướng về phía mình, tay duỗi thẳng ngang vai.", "Hands: hold the rope ends with thumbs pointing back at you, arms straight at shoulder height.", at("elbow", undefined, [0, 14])),
      cue("Thân: đứng thẳng, sườn hạ, một chân có thể lùi sau để vững.", "Trunk: stand tall, ribs down; one foot may step back for balance.", at("spine", undefined, [-18, 0]))
    ]],
    phases: [
      [stepTitle.pull, [start, end], [
        cue("Kéo dây về ngang mắt, khuỷu cao ngang vai hoặc hơn.", "Pull toward eye level with the elbows at shoulder height or above.", at("elbow", 180, [0, 14])),
        cue("Tách hai đầu dây, xoay tay để nắm đấm kết thúc cạnh tai, cẳng tay gần thẳng đứng.", "Split the rope and rotate so the fists finish beside the ears, forearms near vertical.", ang("fwd", "elbow", "wrist", [16, -4])),
        cue("Ép bả vai về sau và xuống, không nhún vai.", "Squeeze the shoulder blades back and down without shrugging.", at("shoulder", undefined, [-8, 16]))
      ]],
      [t("Trả về", "Returning"), [end, start], [
        cue("Duỗi tay chậm về trước trong 2 giây, khuỷu vẫn cao.", "Reach forward slowly over 2 seconds with the elbows still high.", at("elbow", 0, [0, 14])),
        cue("Thân đứng yên, không bị dây kéo về trước.", "The torso stays still and is not pulled forward by the cable.", at("spine", undefined, [-18, 0])),
        cue("Tay duỗi thẳng khoảng 180° trước rep tiếp theo.", "Arms reach about 180° before the next rep.", ang("shoulder", "elbow", "wrist", [0, -14]))
      ]]
    ],
    mistakes: [
      [t("Khuỷu tụt thấp như kéo row", "Elbows dropping into a row"), t("Giữ khuỷu ngang vai trở lên và kéo về ngang mắt; giảm tải.", "Keep the elbows at shoulder height or above and pull to eye level; reduce the load."), pose(92, [205, 40], 0.85), end, at("elbow", undefined, [-14, 8])],
      [t("Ngả người ra sau để kéo", "Leaning back to pull"), t("Đứng thẳng, sườn hạ; tải phải đủ nhẹ để chỉ vai và bả vai chuyển động.", "Stand tall with the ribs down; the load must be light enough that only the shoulders and blades move."), pose(112, [165, 72], 0.75), end, ang("up", "hip", "shoulder", [-10, -8])]
    ]
  });
}

function raise(movementId: "lateral_raise" | "rear_delt_fly"): ExerciseTechnique {
  const rear = movementId === "rear_delt_fly";
  const frame: Frame = { view: "front", box: [10, 2, 180, 172], floor: 168, grip: { kind: "dumbbell" } };
  const pose = (arm: [number, number], torso = rear ? 0.55 : 1): TechniquePose => ({ hip: [100, rear ? 76 : 84], torso: 90, leg: [-86, -90], foot: -80, arm, scale: { torso } });
  const down = pose(rear ? [-80, -95] : [-82, -86]);
  const up = pose(rear ? [-4, -14] : [-6, -16]);
  const armAngle = ang("along", "shoulder1", "elbow", [16, 6]);
  return technique(movementId, ["dumbbell"], frame, {
    setup: [down, rear ? [
      cue("Thân: gập ở hông đến khi thân gần song song sàn (hình vẽ nhìn từ phía trước), lưng thẳng.", "Trunk: hinge at the hips until the torso is near parallel to the floor (figure seen from the front), back flat.", at("shoulder", undefined, [0, -14])),
      cue("Tay: tạ treo thẳng dưới vai, lòng bàn tay hướng vào nhau, khuỷu chùng nhẹ.", "Hands: weights hanging straight under the shoulders, palms facing each other, elbows soft.", at("wrist", undefined, [14, 0])),
      cue("Chân: rộng bằng hông, gối chùng nhẹ.", "Feet: hip width, knees soft.", at("knee", undefined, [14, 0]))
    ] : [
      cue("Tay: tạ ở hai bên đùi, lòng bàn tay hướng vào trong, khuỷu chùng nhẹ 10–15°.", "Hands: weights beside the thighs, palms facing in, elbows soft at 10–15°.", at("wrist", undefined, [14, 0])),
      cue("Bả vai: hạ vai xa tai và giữ như vậy suốt set.", "Shoulder blades: shoulders down from the ears and held there all set.", at("shoulder2", -90, [-14, -6])),
      cue("Thân và chân: đứng thẳng, chân rộng bằng hông, gồng bụng.", "Trunk and feet: stand tall, feet hip width, abs braced.", at("hip"))
    ]],
    phases: [
      [stepTitle.raise, [down, up], [
        cue(rear ? "Mở tay sang hai bên đến ngang vai, cánh tay vuông góc khoảng 90° với thân." : "Nâng tay sang hai bên đến ngang vai: cánh tay khoảng 80–90° so với thân.", rear ? "Open the arms out to shoulder level, upper arms about 90° from the torso." : "Raise out to the sides to shoulder height: upper arms about 80–90° from the torso.", armAngle),
        cue("Khuỷu dẫn chuyển động và luôn cao bằng hoặc hơn cổ tay.", "Elbows lead and stay level with or above the wrists.", at("elbow2", 90, [0, 14])),
        cue(rear ? "Ép nhẹ bả vai ở đỉnh, cổ thả lỏng." : "Vai không nhún lên tai.", rear ? "Squeeze the shoulder blades lightly at the top, neck relaxed." : "No shrugging toward the ears.", at("shoulder", undefined, [0, 16]))
      ]],
      [stepTitle.lower, [up, down], [
        cue("Hạ chậm trong 2–3 giây theo đúng đường cũ.", "Lower over 2–3 seconds along the same path.", at("wrist", -90, [14, 0])),
        cue("Góc khuỷu chùng nhẹ không đổi.", "The soft elbow bend does not change.", ang("shoulder2", "elbow2", "wrist2", [-16, 0])),
        cue(rear ? "Thân vẫn gập cố định, không dựng lên." : "Thân đứng yên, không đung đưa.", rear ? "The torso stays hinged and does not rise." : "The torso stays still with no swaying.", at("hip"))
      ]]
    ],
    mistakes: [
      [t("Nâng quá vai và nhún vai", "Raising above the shoulders and shrugging"), t("Dừng ở ngang vai (khoảng 90°) và giữ vai xa tai; giảm tải.", "Stop at shoulder height (about 90°) and keep the shoulders down; reduce the load."), pose([32, 26]), up, armAngle],
      rear
        ? [t("Gập khuỷu, kéo như row", "Bending the elbows into a row"), t("Giữ khuỷu chùng nhẹ cố định và mở tay theo vòng cung rộng.", "Keep the soft elbow bend fixed and sweep the arms in a wide arc."), pose([-30, -120]), up, ang("shoulder1", "elbow", "wrist", [16, 0])]
        : [t("Cổ tay cao hơn khuỷu", "Wrists higher than the elbows"), t("Dẫn bằng khuỷu, hơi nghiêng tạ như rót nước; cổ tay không cao hơn khuỷu.", "Lead with the elbows and tip the weights slightly as if pouring; wrists never above the elbows."), pose([-28, 30]), up, at("wrist", undefined, [14, -8])]
    ]
  });
}

export const upperTechniques: ExerciseTechnique[] = [
  inclinePress("bar", ["barbell", "smith"]),
  inclinePress("dumbbell", ["dumbbell"]),
  chestFly(),
  pushUp(),
  dip(),
  oneArmRow(),
  facePull(),
  raise("lateral_raise"),
  raise("rear_delt_fly")
];
