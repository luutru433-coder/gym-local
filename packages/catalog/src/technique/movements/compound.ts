import type { ExerciseTechnique, TechniquePose } from "@gym/contracts";
import { ang, at, cue, onFloor, standing, stepTitle, t, technique } from "./shared";
import type { Frame } from "./shared";

const stand = onFloor(100);

function squat(loaded: boolean, equipment: ExerciseTechnique["equipment"]): ExerciseTechnique {
  const arm: TechniquePose["arm"] = loaded ? [-100, 80] : [-55, 75];
  const frame: Frame = { ...standing, grip: loaded ? { kind: "bar", at: "shoulder", offset: [-7, -2], size: 15 } : { kind: equipment.includes("dumbbell") ? "dumbbell" : "none" } };
  const top: TechniquePose = { ...stand, torso: 86, leg: [-88, -92], arm };
  const bottom: TechniquePose = { ...stand, torso: 55, leg: [4, -112], arm };
  const shallow: TechniquePose = { ...stand, torso: 68, leg: [-42, -100], arm };
  const folded: TechniquePose = { ...stand, torso: 28, leg: [-12, -100], arm };
  const front: Partial<Frame> = { view: "front", grip: { kind: "none" } };
  const frontPose = (thigh: number, shin: number): TechniquePose => ({ hip: [100, 96], torso: 90, leg: [thigh, shin], foot: -70, arm: [-75, 100], scale: { thigh: 0.55, torso: 0.8 } });
  return technique("squat", equipment, frame, {
    setup: [top, [
      cue(loaded ? "Tay: thanh đòn tựa trên cơ thang (không tì lên cổ), nắm chặt, khuỷu hướng xuống dưới thanh đòn." : "Tay: giữ tạ sát ngực (hoặc đưa tay ra trước), khuỷu hướng xuống.", loaded ? "Hands: bar rests on the upper traps (not the neck), tight grip, elbows pointing down under the bar." : "Hands: hold the weight against the chest (or reach forward), elbows pointing down.", at("wrist", undefined, [14, -6])),
      cue("Chân: rộng bằng vai hoặc hơn một chút, mũi chân xoay ra 15–30°, trọng tâm giữa bàn chân.", "Feet: shoulder width or slightly wider, toes turned out 15–30°, weight over mid-foot.", at("ankle", undefined, [16, -8])),
      cue("Lưng: ngực mở, hít sâu và gồng bụng trước khi hạ; lưng giữ thẳng tự nhiên.", "Back: chest open, big breath and braced trunk before descending; spine neutral.", at("spine", undefined, [-18, 0]))
    ]],
    phases: [
      [stepTitle.lower, [top, bottom], [
        cue("Đẩy hông ra sau và gập gối cùng lúc; gối đi theo hướng mũi chân.", "Send the hips back and bend the knees together; knees track over the toes.", at("knee", 0)),
        cue("Thân nghiêng về trước khoảng 30–45°, lưng vẫn thẳng.", "Torso leans forward about 30–45° with the back still flat.", ang("up", "hip", "shoulder")),
        cue("Gót chân luôn chạm sàn.", "Heels stay on the floor.", at("ankle", undefined, [-14, 0]))
      ]],
      [stepTitle.bottom, [bottom], [
        cue("Nếp gấp hông ngang hoặc thấp hơn đầu gối một chút: đùi song song sàn, gối gập khoảng 60–70°.", "Hip crease level with or just below the knee: thighs parallel, knees bent to about 60–70°.", ang("hip", "knee", "ankle", [10, 6])),
        cue("Ống chân nghiêng về trước khoảng 20–25°, gối có thể qua mũi chân.", "Shins lean forward about 20–25°; knees may pass the toes.", ang("up", "ankle", "knee", [12, -8])),
        cue(loaded ? "Thanh đòn vẫn nằm thẳng trên giữa bàn chân." : "Tạ và vai vẫn nằm trên giữa bàn chân.", loaded ? "The bar stays stacked over mid-foot." : "The weight and shoulders stay over mid-foot.", at("shoulder", -90, [-16, 0]))
      ]],
      [stepTitle.rise, [bottom, top], [
        cue("Đạp cả bàn chân xuống sàn; hông và vai đi lên cùng tốc độ.", "Drive through the whole foot; hips and shoulders rise at the same rate.", at("shoulder", 90, [-16, 0])),
        cue("Gối vẫn mở theo hướng mũi chân, không khép vào trong.", "Knees keep tracking over the toes, never caving inward.", at("knee")),
        cue("Kết thúc đứng thẳng, hông và gối duỗi hết (khoảng 180°), không ưỡn lưng.", "Finish tall with hips and knees fully extended (about 180°) without leaning back.", ang("shoulder", "hip", "knee", [-34, 0]))
      ]]
    ],
    mistakes: [
      [t("Gối khép vào trong", "Knees caving inward"), t("Đẩy gối ra ngoài theo hướng mũi chân suốt cả rep; giảm tải nếu gối vẫn khép.", "Push the knees out in line with the toes for the whole rep; reduce the load if they still cave."), frontPose(-98, -68), frontPose(-62, -100), at("knee", undefined, [12, -10]), front],
      [t("Gập người quá nhiều, hông lên trước", "Folding forward, hips rising first"), t("Giữ ngực mở và để hông với vai đi lên cùng lúc; thân nghiêng không quá 45°.", "Keep the chest up and let hips and shoulders rise together; no more than about 45° of lean."), folded, bottom, ang("up", "hip", "shoulder")],
      [t("Squat quá nông", "Cutting the depth short"), t("Hạ đến khi đùi song song sàn (gối khoảng 90° hoặc sâu hơn); giảm tải nếu chưa xuống đủ sâu.", "Lower until the thighs are parallel (knee about 90° or deeper); reduce the load if depth is missing."), shallow, bottom, ang("hip", "knee", "ankle", [10, 6])]
    ]
  });
}

function deadlift(equipment: ExerciseTechnique["equipment"]): ExerciseTechnique {
  const frame: Frame = { ...standing, grip: { kind: "bar", size: 20 } };
  const start: TechniquePose = { ...stand, torso: 27, leg: [-17, -100], arm: [-88, -88] };
  const knee: TechniquePose = { ...stand, torso: 30, leg: [-50, -92], arm: [-98, -98] };
  const top: TechniquePose = { ...stand, torso: 90, leg: [-89, -91], arm: [-90, -90] };
  return technique("deadlift", equipment, frame, {
    setup: [start, [
      cue("Chân: rộng bằng hông, thanh đòn nằm trên giữa bàn chân, cách ống chân khoảng 2–3 cm.", "Feet: hip width, bar over mid-foot about 2–3 cm from the shins.", at("ankle", undefined, [-16, 0])),
      cue("Tay: nắm ngay ngoài hai chân, tay duỗi thẳng, vai nằm ngay trên hoặc hơi trước thanh đòn.", "Hands: grip just outside the legs, arms straight, shoulders directly over or slightly in front of the bar.", at("shoulder", undefined, [14, -8])),
      cue("Lưng: thẳng từ hông đến đầu, nghiêng khoảng 25–35° so với sàn; siết xô để kéo căng thanh đòn.", "Back: flat from hips to head, about 25–35° above the floor; squeeze the lats to take the slack out of the bar.", ang("fwd", "hip", "shoulder", [0, -12])),
      cue("Hông cao hơn gối và thấp hơn vai.", "Hips higher than the knees and lower than the shoulders.", at("hip", undefined, [-14, -6]))
    ]],
    phases: [
      [t("Rời sàn", "Off the floor"), [start, knee], [
        cue("Đạp sàn bằng chân; góc lưng giữ nguyên cho đến khi thanh đòn qua gối.", "Push the floor away with the legs; the back angle stays the same until the bar passes the knees.", ang("fwd", "hip", "shoulder", [0, -12])),
        cue("Thanh đòn trượt sát ống chân theo đường thẳng đứng.", "The bar slides up close to the shins in a vertical line.", at("wrist", 90, [14, 6])),
        cue("Tay luôn duỗi thẳng, không co khuỷu để kéo.", "Arms stay straight; never bend the elbows to pull.", at("elbow", undefined, [14, 0]))
      ]],
      [t("Khóa hông", "Lockout"), [knee, top], [
        cue("Qua gối thì đẩy hông về phía thanh đòn và siết mông.", "Once past the knees, drive the hips to the bar and squeeze the glutes.", at("hip", 0, [-18, -16])),
        cue("Kết thúc đứng thẳng: hông và gối 180°, vai nằm trên hông, không ngửa ra sau.", "Finish standing tall: hips and knees at 180°, shoulders over hips, no leaning back.", ang("shoulder", "hip", "knee", [14, -12])),
        cue("Thanh đòn vẫn chạm đùi.", "The bar stays against the thighs.", at("wrist", undefined, [18, 16]))
      ]],
      [stepTitle.lower, [top, start], [
        cue("Đẩy hông ra sau trước, thanh đòn trượt dọc đùi.", "Push the hips back first and slide the bar down the thighs.", at("hip", 180, [0, -14])),
        cue("Chỉ gập gối nhiều khi thanh đòn đã qua gối.", "Bend the knees more only after the bar has passed them.", at("knee", undefined, [14, 0])),
        cue("Lưng vẫn thẳng cho đến khi tạ chạm sàn.", "Back stays flat until the plates touch the floor.", at("spine", undefined, [0, -14]))
      ]]
    ],
    mistakes: [
      [t("Cong lưng khi kéo", "Rounding the back"), t("Mở ngực, siết xô và gồng bụng trước khi kéo; giảm tải nếu lưng vẫn cong.", "Lift the chest, squeeze the lats and brace before pulling; reduce the load if the back still rounds."), { ...start, torso: 30, round: 20 }, start, at("spine", undefined, [0, -16])],
      [t("Thanh đòn xa ống chân", "Bar drifting away from the shins"), t("Đặt thanh đòn trên giữa bàn chân và kéo sát chân suốt đường đi.", "Start with the bar over mid-foot and keep it against the legs all the way up."), { ...stand, torso: 27, leg: [-17, -100], arm: [-68, -68] }, start, at("wrist", undefined, [16, -14])],
      [t("Ngửa người ra sau ở đỉnh", "Leaning back at the top"), t("Dừng khi thân thẳng đứng, siết mông thay vì ưỡn thắt lưng.", "Stop when the body is vertical; squeeze the glutes instead of arching the lower back."), { ...top, torso: 104, round: -8 }, top, ang("shoulder", "hip", "knee", [-32, 0])]
    ]
  });
}

function romanianDeadlift(kind: "bar" | "dumbbell", equipment: ExerciseTechnique["equipment"]): ExerciseTechnique {
  const frame: Frame = { ...standing, grip: { kind, size: 15 } };
  const top: TechniquePose = { ...stand, torso: 90, leg: [-87, -93], arm: [-90, -90] };
  const bottom: TechniquePose = { ...stand, torso: 22, leg: [-70, -97], arm: [-115, -115] };
  return technique("romanian_deadlift", equipment, frame, {
    setup: [top, [
      cue("Chân: rộng bằng hông, gối chùng nhẹ khoảng 15–20° và giữ nguyên góc này.", "Feet: hip width, knees unlocked about 15–20° and held at that angle.", ang("hip", "knee", "ankle", [14, 0])),
      cue("Tay: tay duỗi thẳng, tạ chạm đùi, nắm rộng bằng vai.", "Hands: arms straight, weight touching the thighs, shoulder-width grip.", at("wrist", undefined, [14, 0])),
      cue("Lưng và bả vai: ngực mở, bả vai kéo nhẹ về sau và hạ xuống, gồng bụng.", "Back and shoulder blades: chest open, blades gently back and down, trunk braced.", at("shoulder", undefined, [-16, 0]))
    ]],
    phases: [
      [stepTitle.lower, [top, bottom], [
        cue("Đẩy hông thẳng ra sau như đóng cửa bằng mông; gối không gập thêm.", "Push the hips straight back as if closing a door with them; knees do not bend further.", at("hip", 180, [0, -14])),
        cue("Tạ trượt sát đùi và ống chân.", "The weight slides close to the thighs and shins.", at("wrist", undefined, [14, 0])),
        cue("Lưng thẳng, cổ thẳng hàng với lưng.", "Back flat, neck in line with the spine.", at("spine", undefined, [0, -14]))
      ]],
      [stepTitle.bottom, [bottom], [
        cue("Dừng khi thân nghiêng khoảng 15–30° so với sàn hoặc khi đùi sau căng hết, tạ ngay dưới gối.", "Stop when the torso is about 15–30° above the floor or the hamstrings are fully stretched, weight just below the knees.", ang("fwd", "hip", "shoulder", [4, -10])),
        cue("Ống chân gần thẳng đứng.", "Shins stay close to vertical.", at("knee", undefined, [14, 4])),
        cue("Không hạ sâu hơn bằng cách cong lưng.", "Do not gain extra depth by rounding the back.", at("spine", undefined, [0, -14]))
      ]],
      [stepTitle.rise, [bottom, top], [
        cue("Đẩy hông về trước và siết mông để đứng lên.", "Drive the hips forward and squeeze the glutes to stand.", at("hip", 0, [-14, 0])),
        cue("Kết thúc đứng thẳng, hông 180°, không ngửa ra sau.", "Finish tall with the hips at 180°, no leaning back.", ang("shoulder", "hip", "knee", [-32, 0])),
        cue("Tay chỉ treo tạ, không kéo bằng tay.", "The arms only hang on to the weight; they do not pull.", at("elbow", undefined, [14, 0]))
      ]]
    ],
    mistakes: [
      [t("Cong lưng để hạ sâu hơn", "Rounding the back to reach lower"), t("Dừng ngay khi hông không lùi thêm được nữa; giữ ngực mở.", "Stop as soon as the hips cannot travel further back; keep the chest open."), { ...bottom, torso: 22, round: 20, arm: [-90, -90] }, bottom, at("spine", undefined, [0, -16])],
      [t("Gập gối như squat", "Bending the knees like a squat"), t("Giữ gối chùng nhẹ cố định, chuyển động đến từ hông lùi ra sau.", "Keep the soft knee bend fixed; the movement comes from the hips travelling back."), { ...stand, torso: 45, leg: [-35, -108], arm: [-90, -90] }, bottom, ang("hip", "knee", "ankle", [14, 0])],
      [t("Tạ rời xa chân", "Weight drifting away from the legs"), t("Siết xô để kéo tạ sát đùi và ống chân suốt rep.", "Squeeze the lats to keep the weight against the thighs and shins all rep."), { ...bottom, arm: [-65, -65] }, bottom, at("wrist", undefined, [16, -12])]
    ]
  });
}

function overheadPress(kind: "bar" | "dumbbell", equipment: ExerciseTechnique["equipment"]): ExerciseTechnique {
  const frame: Frame = { ...standing, box: [10, -52, 180, 212], grip: { kind, size: 12 } };
  const legs = { ...stand, leg: [-89, -91] as [number, number] };
  const rack: TechniquePose = { ...legs, torso: 90, arm: [-68, 92] };
  const middle: TechniquePose = { ...legs, torso: 92, arm: [48, 96], head: -6 };
  const top: TechniquePose = { ...legs, torso: 90, arm: [90, 90], head: 8 };
  return technique("overhead_press", equipment, frame, {
    setup: [rack, [
      cue(kind === "bar" ? "Tay: nắm ngay ngoài vai, thanh đòn nằm ở gốc bàn tay ngang xương đòn, cẳng tay thẳng đứng." : "Tay: tạ ngang vai, cổ tay thẳng, cẳng tay thẳng đứng.", kind === "bar" ? "Hands: grip just outside the shoulders, bar on the heel of the palm at collarbone height, forearms vertical." : "Hands: dumbbells at shoulder height, wrists straight, forearms vertical.", ang("fwd", "elbow", "wrist", [14, 0])),
      cue("Khuỷu: hơi ở phía trước thanh tạ, không xòe ngang sang hai bên.", "Elbows: slightly in front of the weight, not flared straight out to the sides.", at("elbow", undefined, [10, 12])),
      cue("Lưng: siết mông và gồng bụng, xương sườn hạ xuống, không ưỡn thắt lưng.", "Back: glutes and abs tight, ribs down, no arch in the lower back.", at("spine", undefined, [-18, 0])),
      cue("Chân: rộng bằng hông, gối duỗi thẳng, trọng tâm giữa bàn chân.", "Feet: hip width, knees straight, weight over mid-foot.", at("ankle", undefined, [16, -6]))
    ]],
    phases: [
      [stepTitle.press, [rack, middle], [
        cue("Đẩy tạ thẳng lên sát mặt; ngửa nhẹ cằm ra sau để tạ đi qua.", "Press straight up close to the face; tuck the chin back to let the weight pass.", at("wrist", 90)),
        cue("Cẳng tay luôn thẳng đứng dưới tạ.", "Forearms stay vertical under the weight.", ang("fwd", "elbow", "wrist", [14, 0])),
        cue("Thân không ngả ra sau.", "The torso does not lean back.", at("spine", undefined, [-18, 0]))
      ]],
      [stepTitle.top, [middle, top], [
        cue("Khi tạ qua trán, đưa đầu về trước: tạ nằm thẳng trên vai, hông và giữa bàn chân.", "Once the weight clears the forehead, bring the head through: weight stacked over shoulders, hips and mid-foot.", at("wrist", undefined, [14, 0])),
        cue("Tay duỗi thẳng khoảng 180°, nhún vai nhẹ lên để đỡ tạ.", "Arms straight at about 180°, shoulders shrugged up slightly to support the weight.", ang("shoulder", "elbow", "wrist", [14, 0])),
        cue("Sườn vẫn hạ, mông vẫn siết.", "Ribs still down, glutes still tight.", at("spine", undefined, [-18, 0]))
      ]],
      [stepTitle.lower, [top, rack], [
        cue("Hạ tạ theo đúng đường cũ về ngang xương đòn.", "Lower along the same path back to collarbone height.", at("wrist", -90, [14, 0])),
        cue("Khuỷu trở về hơi trước thanh tạ, cẳng tay thẳng đứng.", "Elbows return slightly in front of the weight, forearms vertical.", ang("fwd", "elbow", "wrist", [14, 0])),
        cue("Không nhún gối để lấy đà cho rep sau.", "No knee dip to bounce into the next rep.", at("knee", undefined, [14, 0]))
      ]]
    ],
    mistakes: [
      [t("Ưỡn lưng, ngả người ra sau", "Arching and leaning back"), t("Siết mông và bụng, hạ sườn; giảm tải nếu vẫn phải ngả người.", "Squeeze glutes and abs and pull the ribs down; reduce the load if you still have to lean."), { ...legs, torso: 106, round: -10, arm: [72, 76] }, top, ang("up", "hip", "shoulder", [-10, -6])],
      [t("Tạ ở phía trước, không nằm trên vai", "Weight finishing in front of the shoulders"), t("Đưa đầu về trước khi tạ qua trán để tạ nằm thẳng trên vai và giữa bàn chân.", "Bring the head through once the weight clears the forehead so it stacks over shoulders and mid-foot."), { ...legs, torso: 90, arm: [70, 70] }, top, ang("up", "shoulder", "wrist", [12, 0])],
      [t("Khuỷu ở sau tạ, cẳng tay nghiêng", "Elbows behind the weight, forearms tilted"), t("Xoay khuỷu về hơi trước tạ để cẳng tay thẳng đứng 90° trước khi đẩy.", "Bring the elbows slightly in front of the weight so the forearms are vertical (90°) before pressing."), { ...legs, torso: 90, arm: [-112, 62] }, rack, ang("fwd", "elbow", "wrist", [14, 0])]
    ]
  });
}

function bentOverRow(kind: "bar" | "dumbbell", equipment: ExerciseTechnique["equipment"]): ExerciseTechnique {
  const frame: Frame = { ...standing, grip: { kind, size: 15 } };
  const hinge = { ...stand, leg: [-68, -98] as [number, number] };
  const hang: TechniquePose = { ...hinge, torso: 30, arm: [-90, -90] };
  const top: TechniquePose = { ...hinge, torso: 30, arm: [-160, -72] };
  return technique("horizontal_row", equipment, frame, {
    setup: [hang, [
      cue("Chân: rộng bằng hông, gối chùng nhẹ, trọng tâm giữa bàn chân.", "Feet: hip width, knees slightly bent, weight over mid-foot.", at("knee", undefined, [14, 0])),
      cue("Lưng: gập ở hông đến khi thân nghiêng khoảng 30–45° so với sàn, lưng thẳng.", "Back: hinge at the hips until the torso is about 30–45° above the floor, spine flat.", ang("fwd", "hip", "shoulder", [0, -12])),
      cue("Tay: tay duỗi thẳng dưới vai, nắm rộng hơn vai một chút.", "Hands: arms hanging straight under the shoulders, grip slightly wider than the shoulders.", at("wrist", undefined, [14, 0])),
      cue("Bả vai: hạ vai xa tai trước khi kéo.", "Shoulder blades: set the shoulders down away from the ears before pulling.", at("shoulder", undefined, [10, -12]))
    ]],
    phases: [
      [stepTitle.pull, [hang, top], [
        cue("Kéo khuỷu về phía hông, khuỷu mở khoảng 45° so với thân.", "Pull the elbows toward the hips, about 45° out from the torso.", at("elbow", 150, [0, 12])),
        cue("Góc thân giữ nguyên, không dựng người lên để lấy đà.", "The torso angle stays fixed; no standing up to create momentum.", ang("fwd", "hip", "shoulder", [0, -12])),
        cue("Tạ đi về phía bụng dưới, không về phía ngực.", "The weight travels to the lower belly, not the chest.", at("wrist", undefined, [14, 6]))
      ]],
      [stepTitle.top, [top], [
        cue("Khuỷu qua khỏi thân, gập khoảng 90°.", "Elbows finish past the torso, bent to about 90°.", ang("shoulder", "elbow", "wrist", [-6, -10])),
        cue("Ép hai bả vai vào nhau 1 giây, không nhún vai.", "Squeeze the shoulder blades together for 1 second without shrugging.", at("shoulder", 200, [8, -12])),
        cue("Tạ chạm bụng, cổ tay thẳng.", "The weight touches the belly, wrists straight.", at("wrist", undefined, [14, 6]))
      ]],
      [stepTitle.lower, [top, hang], [
        cue("Hạ tạ chậm đến khi tay duỗi thẳng 180°.", "Lower slowly until the arms are straight at 180°.", ang("shoulder", "elbow", "wrist", [14, 0])),
        cue("Để bả vai trượt về trước ở cuối, nhưng lưng không cong.", "Let the shoulder blades glide forward at the end, but the back does not round.", at("shoulder", undefined, [10, -12])),
        cue("Gối và hông không đổi góc.", "Knees and hips keep the same angles.", at("hip", undefined, [-14, 0]))
      ]]
    ],
    mistakes: [
      [t("Dựng người lên để giật tạ", "Standing up to heave the weight"), t("Giữ thân nghiêng 30–45° cố định; giảm tải để kéo bằng lưng thay vì hông.", "Hold the torso fixed at 30–45°; reduce the load so the back does the pulling, not the hips."), { ...stand, leg: [-80, -94], torso: 66, arm: [-150, -80] }, top, ang("fwd", "hip", "shoulder", [0, -12])],
      [t("Cong lưng", "Rounding the back"), t("Mở ngực, gồng bụng và gập từ hông; nâng thân cao hơn một chút nếu đùi sau quá căng.", "Open the chest, brace and hinge from the hips; raise the torso a little if the hamstrings are too tight."), { ...hang, round: 20 }, hang, at("spine", undefined, [0, -16])],
      [t("Kéo tạ về ngực, khuỷu xòe ngang", "Pulling to the chest with flared elbows"), t("Kéo khuỷu về phía hông để tạ chạm bụng dưới.", "Drive the elbows toward the hips so the weight meets the lower belly."), { ...hinge, torso: 30, arm: [150, -110] }, top, at("elbow", undefined, [-4, -14])]
    ]
  });
}

function hanging(movementId: "pull_up" | "lat_pulldown", equipment: ExerciseTechnique["equipment"]): ExerciseTechnique {
  const pullUp = movementId === "pull_up";
  const legs = pullUp ? { leg: [-86, -90] as [number, number], foot: -80 } : { leg: [-70, -88] as [number, number], foot: -60, scale: { thigh: 0.45 } };
  const body = (hipY: number, hand: [number, number], bend: 1 | -1 = -1): TechniquePose => ({ hip: [100, hipY], torso: 90, ...legs, arm: { to: hand, bend } });
  const frame: Frame = pullUp
    ? { view: "back", box: [14, -34, 172, 232], lines: [[42, 8, 158, 8]], grip: { kind: "none" } }
    : { view: "back", box: [14, -16, 172, 190], pads: [[80, 116, 40, 9]], floor: 168, grip: { kind: "bar" } };
  const hang = pullUp ? body(108, [133, 8]) : body(112, [136, 6]);
  const top = pullUp ? body(60, [133, 8]) : body(112, [131, 62]);
  const half = pullUp ? body(84, [133, 8]) : body(112, [133, 34]);
  const flared = pullUp ? body(62, [150, 8]) : body(112, [146, 50]);
  const handle = pullUp ? "xà" : "thanh kéo";
  const handleEn = pullUp ? "bar" : "bar";
  return technique(movementId, equipment, frame, {
    setup: [hang, [
      cue(`Tay: nắm ${handle} rộng hơn vai khoảng 1,5 lần, lòng bàn tay hướng ra trước, ngón cái ôm ${handle}.`, `Hands: grip the ${handleEn} about 1.5× shoulder width, palms facing away, thumbs wrapped.`, at("wrist", undefined, [12, 10])),
      cue("Bả vai: tay duỗi thẳng nhưng hạ vai xa tai, không treo lỏng người trên khớp vai.", "Shoulder blades: arms straight but shoulders pulled down from the ears, never hanging loose on the joints.", at("shoulder2", -90, [-14, -4])),
      cue(pullUp ? "Thân và chân: gồng bụng, chân hơi đưa ra trước, không vung." : "Thân và chân: ngồi thẳng, đùi chèn chặt dưới đệm, ngả nhẹ ra sau 10–15°.", pullUp ? "Trunk and legs: abs braced, legs slightly in front, no swinging." : "Trunk and legs: sit tall, thighs locked under the pad, lean back just 10–15°.", at("hip", undefined, [0, -18]))
    ]],
    phases: [
      [stepTitle.pull, [hang, top], [
        cue("Hạ bả vai trước, rồi kéo khuỷu xuống về phía sườn.", "Depress the shoulder blades first, then drive the elbows down toward the ribs.", at("elbow", -90, [14, -6])),
        cue("Khuỷu đi xuống ngay dưới cổ tay, cẳng tay gần thẳng đứng.", "Elbows travel down directly under the wrists, forearms near vertical.", ang("up", "elbow", "wrist", [16, 4])),
        cue(pullUp ? "Ngực hướng lên xà, không rướn cằm." : "Ngực nâng lên đón thanh kéo, không giật thân ra sau.", pullUp ? "Chest leads to the bar; do not crane the chin." : "Chest lifts to meet the bar; no jerking the torso back.", at("shoulder", undefined, [0, 14]))
      ]],
      [t("Điểm co cơ", "Peak"), [top], [
        cue(pullUp ? "Cằm qua xà, khuỷu gập khoảng 30–45° và nằm sát sườn." : "Thanh kéo chạm ngực trên, khuỷu gập khoảng 30–45° và nằm sát sườn.", pullUp ? "Chin over the bar, elbows closed to about 30–45° and close to the ribs." : "Bar touches the upper chest, elbows closed to about 30–45° and close to the ribs.", ang("shoulder1", "elbow", "wrist", [14, 8])),
        cue("Cánh tay cách thân khoảng 30–45°.", "Upper arms about 30–45° from the torso.", ang("along", "shoulder2", "elbow2", [-14, 10])),
        cue("Vai vẫn hạ thấp, không nhún về phía tai.", "Shoulders still down, not shrugged toward the ears.", at("shoulder", undefined, [0, 14]))
      ]],
      [stepTitle.lower, [top, hang], [
        cue("Hạ chậm trong 2–3 giây, không thả rơi.", "Lower over 2–3 seconds; never drop.", at("elbow", 90, [14, 6])),
        cue("Duỗi tay hết khoảng 180° ở cuối mỗi rep.", "Reach full arm extension, about 180°, at the end of every rep.", ang("shoulder1", "elbow", "wrist", [14, 8])),
        cue("Vai vẫn giữ chủ động, không để tai chạm vai.", "Shoulders stay active; ears never sink into the shoulders.", at("shoulder2", undefined, [-14, -4]))
      ]]
    ],
    mistakes: [
      [t("Chỉ kéo nửa biên độ", "Half reps"), t(pullUp ? "Mỗi rep bắt đầu từ tay duỗi thẳng và kết thúc khi cằm qua xà; dùng dây trợ lực nếu cần." : "Mỗi rep bắt đầu từ tay duỗi thẳng và kết thúc ở ngực trên; giảm tải nếu cần.", pullUp ? "Start every rep from straight arms and finish with the chin over the bar; use band assistance if needed." : "Start every rep from straight arms and finish at the upper chest; reduce the load if needed."), half, top, ang("shoulder1", "elbow", "wrist", [14, 8])],
      [t("Nắm quá rộng, khuỷu xòe ngang", "Grip too wide, elbows flared"), t("Thu tay về khoảng 1,5 lần vai để cẳng tay thẳng đứng và khuỷu kéo xuống sườn.", "Narrow the grip to about 1.5× shoulder width so the forearms are vertical and the elbows pull down to the ribs."), flared, top, ang("up", "elbow", "wrist", [16, 4])],
      [t("Nhún vai lên tai", "Shoulders shrugged to the ears"), t("Hạ bả vai xuống trước khi kéo và giữ khoảng cách giữa vai và tai.", "Pull the shoulder blades down before each pull and keep space between shoulders and ears."), { ...hang, head: 0, scale: { ...(hang.scale ?? {}), torso: 1.12 } }, hang, at("shoulder2", -90, [-14, -4])]
    ]
  });
}

export const compoundTechniques: ExerciseTechnique[] = [
  squat(true, ["barbell", "smith"]),
  squat(false, ["bodyweight", "dumbbell"]),
  deadlift(["barbell"]),
  romanianDeadlift("bar", ["barbell", "smith"]),
  romanianDeadlift("dumbbell", ["dumbbell"]),
  overheadPress("bar", ["barbell", "smith"]),
  overheadPress("dumbbell", ["dumbbell"]),
  bentOverRow("bar", ["barbell", "smith"]),
  bentOverRow("dumbbell", ["dumbbell"]),
  hanging("pull_up", ["bodyweight", "resistance_band"]),
  hanging("lat_pulldown", ["cable", "machine"])
];
