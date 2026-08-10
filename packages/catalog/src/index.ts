import type {
  ContentSource,
  EquipmentType,
  ExerciseVideoGuide,
  ExerciseVariant,
  LoadEntryMode,
  LocalizedText,
  Movement,
  MuscleGroup
} from "@gym/contracts";
import videoGuideManifest from "../../../content/exercise-video-guides.json";

type Pattern = Movement["pattern"];

interface MovementSeed {
  id: string;
  vi: string;
  en: string;
  muscles: MuscleGroup[];
  secondary?: MuscleGroup[];
  pattern: Pattern;
  equipment: EquipmentType[];
  cueVi: string;
  cueEn: string;
  safetyVi: string;
  safetyEn: string;
  needsBench?: boolean;
}

export const CONTENT_SOURCES: ContentSource[] = [
  {
    id: "gym-local-original",
    label: "Gym Local bilingual core",
    sourcePath: "docs/content-policy.md",
    author: "Gym Local",
    licenseId: "project-content",
    attribution: "Original bilingual structure and beginner cues created for Gym Local.",
    reviewedAt: "2026-08-10"
  },
  {
    id: "youtube-video-guides",
    label: "Curated YouTube exercise demonstrations",
    sourceUrl: "https://www.youtube.com/",
    author: "Individual creators named on each guide",
    licenseId: "provider-terms",
    licenseUrl: "https://developers.google.com/youtube/terms/developer-policies",
    attribution: "Direct, privacy-enhanced embeds remain on YouTube; Gym Local stores metadata only and names the creator on every guide.",
    reviewedAt: "2026-08-10"
  },
  {
    id: "free-exercise-db",
    label: "Free Exercise DB",
    sourceUrl: "https://github.com/yuhonas/free-exercise-db",
    author: "Free Exercise DB contributors",
    licenseId: "unlicense",
    licenseUrl: "https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md",
    attribution: "Public-domain exercise reference images served from the Free Exercise DB repository.",
    reviewedAt: "2026-08-10"
  }
];

const freeExerciseMedia: Partial<Record<string, { path: string; title: string }>> = {
  "chest_press__barbell": { path: "Barbell_Bench_Press_-_Medium_Grip/0.jpg", title: "Barbell Bench Press - Medium Grip" },
  "chest_press__dumbbell": { path: "Dumbbell_Bench_Press/0.jpg", title: "Dumbbell Bench Press" },
  "chest_press__smith": { path: "Smith_Machine_Bench_Press/0.jpg", title: "Smith Machine Bench Press" },
  "chest_press__cable": { path: "Cable_Chest_Press/0.jpg", title: "Cable Chest Press" },
  "chest_press__machine": { path: "Machine_Bench_Press/0.jpg", title: "Machine Bench Press" },
  "squat__barbell": { path: "Barbell_Full_Squat/0.jpg", title: "Barbell Full Squat" },
  "squat__dumbbell": { path: "Dumbbell_Squat/0.jpg", title: "Dumbbell Squat" },
  "horizontal_row__cable": { path: "Seated_Cable_Rows/0.jpg", title: "Seated Cable Rows" },
  "romanian_deadlift__barbell": { path: "Romanian_Deadlift/0.jpg", title: "Romanian Deadlift" },
  "overhead_press__cable": { path: "Seated_Cable_Shoulder_Press/0.jpg", title: "Seated Cable Shoulder Press" },
  "hip_thrust__barbell": { path: "Barbell_Hip_Thrust/0.jpg", title: "Barbell Hip Thrust" },
  "biceps_curl__machine": { path: "Machine_Bicep_Curl/0.jpg", title: "Machine Bicep Curl" },
  "biceps_curl__cable": { path: "Standing_Biceps_Cable_Curl/0.jpg", title: "Standing Biceps Cable Curl" },
  "seated_calf_raise__machine": { path: "Seated_Calf_Raise/0.jpg", title: "Seated Calf Raise" }
};

interface VideoGuideManifestEntry {
  variantId: string;
  provider: "youtube";
  demonstrationType: "human" | "3d";
  videoId: string;
  title: string;
  creator: string;
  duration: string;
  reviewMethod: "title-and-equipment-match";
  reviewedAt: string;
  lastVerifiedAt: string;
}

const videoGuideByVariant = new Map(
  (videoGuideManifest as VideoGuideManifestEntry[]).map((entry) => [entry.variantId, entry])
);

function videoGuide(variantId: string, variantName: LocalizedText): ExerciseVideoGuide {
  const entry = videoGuideByVariant.get(variantId);
  if (!entry) throw new Error(`Reviewed exercise variant ${variantId} is missing a direct video guide`);
  return {
    id: `video_${variantId}`,
    variantId,
    provider: entry.provider,
    demonstrationType: entry.demonstrationType,
    videoId: entry.videoId,
    watchUrl: `https://www.youtube.com/watch?v=${entry.videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${entry.videoId}/hqdefault.jpg`,
    sourceId: "youtube-video-guides",
    title: {
      vi: `${variantName.vi} · ${entry.title}`,
      en: entry.title
    },
    creator: entry.creator,
    onlineOnly: true,
    reviewStatus: "reviewed",
    reviewMethod: entry.reviewMethod,
    reviewedAt: entry.reviewedAt,
    lastVerifiedAt: entry.lastVerifiedAt
  };
}

const movementSeeds: MovementSeed[] = [
  { id: "chest_press", vi: "Đẩy ngực ngang", en: "Chest Press", muscles: ["chest"], secondary: ["triceps", "shoulders"], pattern: "push", equipment: ["dumbbell", "barbell", "smith", "machine", "cable", "resistance_band"], cueVi: "Giữ bả vai kéo về sau, đẩy tay theo đường ổn định ngang ngực.", cueEn: "Keep the shoulder blades set and press on a stable line from mid-chest.", safetyVi: "Không để khuỷu tay xòe vuông góc và không nảy tạ khỏi ngực.", safetyEn: "Avoid flaring the elbows straight out or bouncing the load from the chest.", needsBench: true },
  { id: "incline_chest_press", vi: "Đẩy ngực trên", en: "Incline Chest Press", muscles: ["chest"], secondary: ["shoulders", "triceps"], pattern: "push", equipment: ["dumbbell", "barbell", "smith", "machine", "cable"], cueVi: "Đặt ghế dốc vừa phải và hướng lực về phần ngực trên.", cueEn: "Use a moderate bench angle and press toward the upper chest line.", safetyVi: "Góc ghế quá cao sẽ chuyển nhiều tải sang vai trước.", safetyEn: "An excessively steep bench shifts too much work to the front delts.", needsBench: true },
  { id: "chest_fly", vi: "Ép ngực", en: "Chest Fly", muscles: ["chest"], secondary: ["shoulders"], pattern: "isolation", equipment: ["dumbbell", "cable", "machine", "resistance_band"], cueVi: "Giữ khuỷu hơi cong và khép hai cánh tay như ôm một thân cây lớn.", cueEn: "Keep a soft elbow bend and bring the arms together as if hugging a tree.", safetyVi: "Dừng biên độ trước khi vai bị kéo quá sâu ra sau thân.", safetyEn: "Stop before the shoulder is pulled excessively behind the torso.", needsBench: true },
  { id: "push_up", vi: "Chống đẩy", en: "Push-Up", muscles: ["chest"], secondary: ["triceps", "shoulders", "core"], pattern: "push", equipment: ["bodyweight", "resistance_band", "smith"], cueVi: "Giữ thân người thành một đường thẳng và đưa ngực xuống giữa hai tay.", cueEn: "Keep the body in one line and lower the chest between the hands.", safetyVi: "Không võng lưng hoặc nhún vai sát tai.", safetyEn: "Do not sag the lower back or shrug the shoulders toward the ears." },
  { id: "dip", vi: "Hít xà kép", en: "Dip", muscles: ["chest", "triceps"], secondary: ["shoulders"], pattern: "push", equipment: ["bodyweight", "machine", "resistance_band"], cueVi: "Hạ người có kiểm soát, giữ vai xa tai và cẳng tay gần thẳng đứng.", cueEn: "Lower under control, keep shoulders away from ears, and forearms near vertical.", safetyVi: "Giảm độ sâu nếu phía trước vai bị đau hoặc mất kiểm soát.", safetyEn: "Reduce depth if the front of the shoulder hurts or control is lost." },
  { id: "lat_pulldown", vi: "Kéo xô từ trên", en: "Lat Pulldown", muscles: ["back"], secondary: ["biceps"], pattern: "pull", equipment: ["cable", "machine", "resistance_band"], cueVi: "Kéo khuỷu xuống về phía hông, giữ ngực cao và cổ trung lập.", cueEn: "Drive the elbows toward the hips while keeping the chest tall and neck neutral.", safetyVi: "Không kéo thanh ra sau gáy hoặc giật người để lấy đà.", safetyEn: "Do not pull behind the neck or jerk the torso for momentum." },
  { id: "pull_up", vi: "Kéo xà", en: "Pull-Up", muscles: ["back"], secondary: ["biceps", "core"], pattern: "pull", equipment: ["bodyweight", "machine", "resistance_band"], cueVi: "Bắt đầu bằng hạ bả vai rồi kéo ngực hướng về xà.", cueEn: "Initiate by depressing the shoulder blades, then pull the chest toward the bar.", safetyVi: "Không thả rơi xuống đáy hoặc vung chân mất kiểm soát.", safetyEn: "Avoid dropping into the bottom or swinging the legs." },
  { id: "horizontal_row", vi: "Kéo ngang", en: "Horizontal Row", muscles: ["back"], secondary: ["biceps", "shoulders"], pattern: "pull", equipment: ["cable", "machine", "barbell", "dumbbell", "resistance_band", "smith"], cueVi: "Kéo khuỷu về sau và ép nhẹ bả vai, không nhún vai.", cueEn: "Drive the elbows back and gently squeeze the shoulder blades without shrugging.", safetyVi: "Giữ lưng trung lập và tránh giật tải bằng thắt lưng.", safetyEn: "Keep a neutral spine and avoid jerking the load with the lower back." },
  { id: "one_arm_row", vi: "Kéo lưng một tay", en: "One-Arm Row", muscles: ["back"], secondary: ["biceps", "core"], pattern: "pull", equipment: ["dumbbell", "cable", "machine", "resistance_band"], cueVi: "Giữ hông vuông, kéo khuỷu về túi quần sau.", cueEn: "Keep the hips square and pull the elbow toward the back pocket.", safetyVi: "Không xoay mạnh thân người để hoàn thành rep.", safetyEn: "Do not aggressively rotate the torso to finish the rep." },
  { id: "pullover", vi: "Kéo xô tay thẳng", en: "Pullover", muscles: ["back"], secondary: ["chest", "triceps"], pattern: "pull", equipment: ["cable", "dumbbell", "machine", "resistance_band"], cueVi: "Giữ khuỷu gần cố định và kéo bằng nách xuống phía hông.", cueEn: "Keep the elbows nearly fixed and pull from the armpits toward the hips.", safetyVi: "Không ưỡn lưng để tăng biên độ.", safetyEn: "Do not overarch the lower back to create extra range." },
  { id: "face_pull", vi: "Kéo dây về mặt", en: "Face Pull", muscles: ["shoulders", "back"], secondary: ["biceps"], pattern: "pull", equipment: ["cable", "resistance_band"], cueVi: "Kéo về ngang mắt và xoay tay để nắm đấm hướng ra sau.", cueEn: "Pull toward eye level and rotate so the fists finish beside the head.", safetyVi: "Dùng tải vừa để vai di chuyển trơn tru, không giật.", safetyEn: "Use a moderate load so the shoulders move smoothly without jerking." },
  { id: "back_extension", vi: "Duỗi lưng", en: "Back Extension", muscles: ["hamstrings", "glutes"], secondary: ["back"], pattern: "hinge", equipment: ["bodyweight", "machine", "barbell"], cueVi: "Gập ở hông rồi siết mông để trở về đường thẳng.", cueEn: "Hinge at the hips, then squeeze the glutes to return to a straight line.", safetyVi: "Không ngửa lưng vượt quá vị trí trung lập ở đỉnh.", safetyEn: "Do not hyperextend beyond a neutral spine at the top." },
  { id: "overhead_press", vi: "Đẩy vai qua đầu", en: "Overhead Press", muscles: ["shoulders"], secondary: ["triceps", "core"], pattern: "push", equipment: ["dumbbell", "barbell", "smith", "machine", "cable", "resistance_band"], cueVi: "Siết bụng và đẩy tải lên trên tai mà không ưỡn lưng.", cueEn: "Brace the trunk and press overhead without leaning through the lower back.", safetyVi: "Giảm tải hoặc đổi tay cầm nếu vai bị kẹt hoặc đau.", safetyEn: "Reduce load or change grip if the shoulder feels pinched or painful." },
  { id: "lateral_raise", vi: "Nâng vai ngang", en: "Lateral Raise", muscles: ["shoulders"], secondary: [], pattern: "isolation", equipment: ["dumbbell", "cable", "machine", "resistance_band"], cueVi: "Dẫn chuyển động bằng khuỷu tay, nâng theo mặt phẳng hơi chếch về trước.", cueEn: "Lead with the elbows and raise slightly forward of the body.", safetyVi: "Không nhún người hoặc nâng quá cao khi vai mất thoải mái.", safetyEn: "Avoid heaving the torso or raising beyond a comfortable shoulder range." },
  { id: "rear_delt_fly", vi: "Dang vai sau", en: "Rear Delt Fly", muscles: ["shoulders"], secondary: ["back"], pattern: "isolation", equipment: ["dumbbell", "cable", "machine", "resistance_band"], cueVi: "Mở cánh tay sang hai bên, giữ vai thấp và ngực ổn định.", cueEn: "Open the arms out to the sides while keeping the shoulders low and chest steady.", safetyVi: "Không kéo quá xa khiến đầu vai trượt về trước.", safetyEn: "Do not pull so far that the shoulder head rolls forward." },
  { id: "front_raise", vi: "Nâng vai trước", en: "Front Raise", muscles: ["shoulders"], secondary: ["chest"], pattern: "isolation", equipment: ["dumbbell", "cable", "barbell", "resistance_band"], cueVi: "Nâng tải đến ngang vai bằng nhịp đều, cổ tay trung lập.", cueEn: "Raise to shoulder height with a smooth tempo and neutral wrists.", safetyVi: "Không dùng lưng để hất tải lên.", safetyEn: "Do not use the lower back to swing the load upward." },
  { id: "upright_row", vi: "Kéo đứng", en: "Upright Row", muscles: ["shoulders"], secondary: ["biceps", "back"], pattern: "pull", equipment: ["barbell", "cable", "dumbbell", "smith", "resistance_band"], cueVi: "Kéo khuỷu lên và ra ngoài trong biên độ vai thoải mái.", cueEn: "Guide the elbows up and out within a comfortable shoulder range.", safetyVi: "Dừng dưới điểm gây kẹt vai; ưu tiên tay cầm rộng vừa.", safetyEn: "Stop below any pinching point and prefer a moderate-width grip." },
  { id: "shrug", vi: "Nhún cầu vai", en: "Shrug", muscles: ["back"], secondary: ["forearms"], pattern: "isolation", equipment: ["dumbbell", "barbell", "smith", "machine", "cable"], cueVi: "Nâng vai thẳng lên, giữ ngực ổn định và dừng ngắn ở đỉnh.", cueEn: "Lift the shoulders straight up, keep the chest steady, and pause briefly at the top.", safetyVi: "Không xoay tròn vai hoặc rướn cổ.", safetyEn: "Do not roll the shoulders or crane the neck." },
  { id: "biceps_curl", vi: "Cuốn tay trước", en: "Biceps Curl", muscles: ["biceps"], secondary: ["forearms"], pattern: "isolation", equipment: ["dumbbell", "barbell", "cable", "machine", "resistance_band"], cueVi: "Giữ khuỷu gần thân và cuốn tay mà không đưa vai ra trước.", cueEn: "Keep the elbows near the torso and curl without rolling the shoulders forward.", safetyVi: "Không ngả người để hất tải.", safetyEn: "Avoid leaning back to swing the load." },
  { id: "hammer_curl", vi: "Cuốn búa", en: "Hammer Curl", muscles: ["biceps", "forearms"], secondary: [], pattern: "isolation", equipment: ["dumbbell", "cable", "resistance_band"], cueVi: "Giữ lòng bàn tay hướng vào nhau và cổ tay thẳng.", cueEn: "Keep the palms facing each other and the wrists straight.", safetyVi: "Giảm tải nếu cổ tay hoặc khuỷu bị đau.", safetyEn: "Reduce load if the wrist or elbow becomes painful." },
  { id: "preacher_curl", vi: "Cuốn tay trên ghế preacher", en: "Preacher Curl", muscles: ["biceps"], secondary: ["forearms"], pattern: "isolation", equipment: ["barbell", "dumbbell", "cable", "machine"], cueVi: "Giữ nách sát mép đệm và duỗi khuỷu có kiểm soát.", cueEn: "Keep the armpits anchored to the pad and extend the elbows under control.", safetyVi: "Không khóa mạnh khuỷu ở đáy với tải nặng.", safetyEn: "Do not forcefully lock the elbows at the bottom under heavy load." },
  { id: "reverse_curl", vi: "Cuốn tay úp", en: "Reverse Curl", muscles: ["forearms", "biceps"], secondary: [], pattern: "isolation", equipment: ["barbell", "dumbbell", "cable", "resistance_band"], cueVi: "Giữ lòng bàn tay úp và cổ tay thẳng suốt chuyển động.", cueEn: "Maintain an overhand grip and straight wrists throughout the curl.", safetyVi: "Dùng tải nhẹ hơn curl thông thường để bảo vệ cổ tay.", safetyEn: "Use less load than a standard curl to protect the wrists." },
  { id: "triceps_pushdown", vi: "Ép tay sau xuống", en: "Triceps Pushdown", muscles: ["triceps"], secondary: [], pattern: "isolation", equipment: ["cable", "resistance_band", "machine"], cueVi: "Khóa khuỷu gần sườn và duỗi cẳng tay xuống hoàn toàn.", cueEn: "Pin the elbows near the ribs and extend the forearms fully downward.", safetyVi: "Không gập người đè cả vai lên tay cầm.", safetyEn: "Do not fold over and drive the handle with the shoulders." },
  { id: "overhead_triceps_extension", vi: "Duỗi tay sau qua đầu", en: "Overhead Triceps Extension", muscles: ["triceps"], secondary: ["shoulders", "core"], pattern: "isolation", equipment: ["dumbbell", "cable", "barbell", "resistance_band", "machine"], cueVi: "Giữ khuỷu hướng lên và duỗi tay mà không ưỡn lưng.", cueEn: "Keep the elbows pointing up and extend without arching the lower back.", safetyVi: "Chọn tay cầm không gây đau khuỷu hoặc vai.", safetyEn: "Choose a grip that does not irritate the elbow or shoulder." },
  { id: "triceps_press", vi: "Đẩy tay sau", en: "Triceps Press", muscles: ["triceps"], secondary: ["chest", "shoulders"], pattern: "push", equipment: ["barbell", "dumbbell", "smith", "machine", "bodyweight"], cueVi: "Giữ khuỷu gần thân và đẩy bằng tay sau.", cueEn: "Keep the elbows close and drive the press with the triceps.", safetyVi: "Không ép cổ tay gập hoặc để khuỷu xòe mất kiểm soát.", safetyEn: "Avoid bent wrists or uncontrolled elbow flare.", needsBench: true },
  { id: "triceps_kickback", vi: "Đá tay sau", en: "Triceps Kickback", muscles: ["triceps"], secondary: ["shoulders"], pattern: "isolation", equipment: ["dumbbell", "cable", "resistance_band"], cueVi: "Giữ cánh tay trên song song thân và chỉ duỗi khuỷu.", cueEn: "Hold the upper arm beside the torso and move only at the elbow.", safetyVi: "Không vung vai để lấy đà.", safetyEn: "Do not swing from the shoulder for momentum." },
  { id: "squat", vi: "Squat", en: "Squat", muscles: ["quadriceps", "glutes"], secondary: ["hamstrings", "core"], pattern: "squat", equipment: ["bodyweight", "barbell", "dumbbell", "smith", "machine", "resistance_band"], cueVi: "Giữ bàn chân bám sàn, đầu gối theo hướng ngón chân và thân người vững.", cueEn: "Keep the feet rooted, knees tracking with the toes, and torso braced.", safetyVi: "Chỉ xuống sâu trong biên độ vẫn kiểm soát được lưng và đầu gối.", safetyEn: "Use only the depth where spine and knee control remain solid." },
  { id: "leg_press", vi: "Đạp chân", en: "Leg Press", muscles: ["quadriceps", "glutes"], secondary: ["hamstrings"], pattern: "squat", equipment: ["machine"], cueVi: "Giữ hông áp đệm và đẩy qua toàn bàn chân.", cueEn: "Keep the hips against the pad and press through the whole foot.", safetyVi: "Không hạ sâu đến mức lưng dưới cuộn khỏi đệm hoặc khóa gối mạnh.", safetyEn: "Do not lower until the low back rolls off the pad or forcefully lock the knees." },
  { id: "split_squat", vi: "Squat tách chân", en: "Split Squat", muscles: ["quadriceps", "glutes"], secondary: ["hamstrings", "core"], pattern: "lunge", equipment: ["bodyweight", "dumbbell", "barbell", "smith", "resistance_band"], cueVi: "Giữ hai chân trên hai đường ray và hạ gối sau thẳng xuống.", cueEn: "Keep the feet on two tracks and lower the rear knee straight down.", safetyVi: "Dùng điểm tựa nếu thăng bằng làm giảm kiểm soát đầu gối.", safetyEn: "Use support if balance compromises knee control." },
  { id: "lunge", vi: "Chùng chân", en: "Lunge", muscles: ["quadriceps", "glutes"], secondary: ["hamstrings", "core"], pattern: "lunge", equipment: ["bodyweight", "dumbbell", "barbell", "smith", "resistance_band"], cueVi: "Bước đủ dài để bàn chân trước bám chắc và gối đi theo mũi chân.", cueEn: "Take a long enough step to keep the lead foot planted and knee tracking over the toes.", safetyVi: "Không để gối đổ vào trong khi đổi hướng.", safetyEn: "Do not let the knee collapse inward during direction changes." },
  { id: "step_up", vi: "Bước lên bục", en: "Step-Up", muscles: ["quadriceps", "glutes"], secondary: ["hamstrings", "calves"], pattern: "lunge", equipment: ["bodyweight", "dumbbell", "barbell", "resistance_band"], cueVi: "Đạp qua chân trên bục và hạn chế bật mạnh chân dưới.", cueEn: "Drive through the foot on the platform and minimize push-off from the trailing leg.", safetyVi: "Chọn bục đủ thấp để giữ hông và gối ổn định.", safetyEn: "Choose a platform low enough to keep the hip and knee controlled." },
  { id: "leg_extension", vi: "Duỗi gối", en: "Leg Extension", muscles: ["quadriceps"], secondary: [], pattern: "isolation", equipment: ["machine", "resistance_band", "cable"], cueVi: "Căn trục máy với gối và duỗi chân theo nhịp đều.", cueEn: "Align the machine pivot with the knee and extend with a smooth tempo.", safetyVi: "Không đá bật hoặc dùng tải gây đau phía trước gối.", safetyEn: "Do not kick explosively or use a load that causes front-knee pain." },
  { id: "hip_thrust", vi: "Đẩy hông", en: "Hip Thrust", muscles: ["glutes"], secondary: ["hamstrings", "core"], pattern: "hinge", equipment: ["bodyweight", "barbell", "dumbbell", "smith", "machine", "resistance_band"], cueVi: "Thu cằm nhẹ, giữ sườn xuống và siết mông đưa hông lên.", cueEn: "Tuck the chin slightly, keep ribs down, and squeeze the glutes to raise the hips.", safetyVi: "Không ưỡn lưng dưới thay cho duỗi hông.", safetyEn: "Do not substitute lower-back extension for hip extension.", needsBench: true },
  { id: "glute_kickback", vi: "Đá mông sau", en: "Glute Kickback", muscles: ["glutes"], secondary: ["hamstrings", "core"], pattern: "isolation", equipment: ["cable", "machine", "resistance_band", "bodyweight"], cueVi: "Giữ xương chậu vuông và đưa đùi ra sau bằng mông.", cueEn: "Keep the pelvis square and drive the thigh back with the glute.", safetyVi: "Không xoay hông hoặc ưỡn lưng để tăng biên độ.", safetyEn: "Avoid rotating the hips or arching the back for extra range." },
  { id: "hip_abduction", vi: "Dang hông", en: "Hip Abduction", muscles: ["glutes"], secondary: [], pattern: "isolation", equipment: ["machine", "cable", "resistance_band", "bodyweight"], cueVi: "Giữ xương chậu ổn định và mở đùi ra ngoài có kiểm soát.", cueEn: "Keep the pelvis steady and move the thigh outward under control.", safetyVi: "Không giật người hoặc dùng biên độ gây kẹt hông.", safetyEn: "Do not jerk the torso or force a pinching hip range." },
  { id: "hip_adduction", vi: "Khép hông", en: "Hip Adduction", muscles: ["quadriceps"], secondary: ["core"], pattern: "isolation", equipment: ["machine", "cable", "resistance_band", "bodyweight"], cueVi: "Giữ thân ổn định và khép đùi bằng nhịp đều.", cueEn: "Keep the torso stable and bring the thigh inward smoothly.", safetyVi: "Không mở chân quá rộng nếu háng khó chịu.", safetyEn: "Do not begin from an excessively wide position if the groin is uncomfortable." },
  { id: "romanian_deadlift", vi: "Romanian Deadlift", en: "Romanian Deadlift", muscles: ["hamstrings", "glutes"], secondary: ["back", "forearms"], pattern: "hinge", equipment: ["barbell", "dumbbell", "smith", "cable", "resistance_band"], cueVi: "Đẩy hông ra sau, giữ tải sát chân và lưng trung lập.", cueEn: "Push the hips back, keep the load close to the legs, and maintain a neutral spine.", safetyVi: "Dừng khi gân kheo căng trước khi lưng dưới cuộn.", safetyEn: "Stop at hamstring tension before the lower back rounds." },
  { id: "leg_curl", vi: "Gập gối", en: "Leg Curl", muscles: ["hamstrings"], secondary: ["calves"], pattern: "isolation", equipment: ["machine", "cable", "resistance_band", "dumbbell"], cueVi: "Giữ hông ổn định và kéo gót về mông.", cueEn: "Keep the hips steady and curl the heels toward the glutes.", safetyVi: "Không nâng hông khỏi đệm hoặc giật tải.", safetyEn: "Do not lift the hips off the pad or jerk the load." },
  { id: "good_morning", vi: "Good Morning", en: "Good Morning", muscles: ["hamstrings", "glutes"], secondary: ["back", "core"], pattern: "hinge", equipment: ["barbell", "smith", "resistance_band", "bodyweight"], cueVi: "Gập hông với gối hơi cong và thân người được siết chặt.", cueEn: "Hinge with softly bent knees and a firmly braced torso.", safetyVi: "Học kỹ bằng tải nhẹ trước khi tăng tạ.", safetyEn: "Learn the movement with a light load before progressing." },
  { id: "nordic_curl", vi: "Nordic Curl", en: "Nordic Curl", muscles: ["hamstrings"], secondary: ["glutes", "core"], pattern: "isolation", equipment: ["bodyweight", "machine", "resistance_band"], cueVi: "Giữ thân từ gối đến đầu thành một đường và hạ xuống chậm.", cueEn: "Keep a straight line from knees to head and lower slowly.", safetyVi: "Dùng hỗ trợ đủ mạnh; không cố giữ khi gân kheo co rút hoặc đau.", safetyEn: "Use enough assistance and stop with hamstring cramping or pain." },
  { id: "standing_calf_raise", vi: "Nhón bắp chân đứng", en: "Standing Calf Raise", muscles: ["calves"], secondary: [], pattern: "isolation", equipment: ["bodyweight", "dumbbell", "barbell", "smith", "machine"], cueVi: "Hạ gót có kiểm soát rồi đẩy qua ngón cái lên cao.", cueEn: "Lower the heel under control, then rise through the big-toe side of the foot.", safetyVi: "Giữ gối và cổ chân thẳng, dùng điểm tựa khi cần.", safetyEn: "Keep the knee and ankle aligned and use support when needed." },
  { id: "seated_calf_raise", vi: "Nhón bắp chân ngồi", en: "Seated Calf Raise", muscles: ["calves"], secondary: [], pattern: "isolation", equipment: ["machine", "dumbbell", "barbell", "smith"], cueVi: "Giữ đùi cố định và di chuyển cổ chân hết biên độ thoải mái.", cueEn: "Keep the thighs fixed and move the ankle through a comfortable full range.", safetyVi: "Đệm tải lên đùi, không đặt trực tiếp lên xương bánh chè.", safetyEn: "Pad the load over the thighs, not directly on the kneecaps." },
  { id: "crunch", vi: "Gập bụng", en: "Crunch", muscles: ["core"], secondary: [], pattern: "core", equipment: ["bodyweight", "cable", "machine", "resistance_band"], cueVi: "Kéo xương sườn về xương chậu và thở ra khi gập.", cueEn: "Bring the ribs toward the pelvis and exhale through the crunch.", safetyVi: "Không kéo cổ hoặc dùng quán tính.", safetyEn: "Do not pull on the neck or use momentum." },
  { id: "leg_raise", vi: "Nâng chân", en: "Leg Raise", muscles: ["core"], secondary: ["quadriceps"], pattern: "core", equipment: ["bodyweight", "cable", "machine"], cueVi: "Cuộn nhẹ xương chậu và nâng chân mà không võng lưng.", cueEn: "Posteriorly tilt the pelvis and raise the legs without arching the back.", safetyVi: "Co gối hoặc giảm biên độ nếu lưng dưới rời điểm tựa.", safetyEn: "Bend the knees or shorten the range if the lower back loses contact." },
  { id: "plank", vi: "Plank", en: "Plank", muscles: ["core"], secondary: ["shoulders", "glutes"], pattern: "core", equipment: ["bodyweight", "resistance_band"], cueVi: "Siết mông, kéo sườn xuống và thở đều trong khi giữ thân thẳng.", cueEn: "Squeeze the glutes, keep ribs down, and breathe while holding a straight line.", safetyVi: "Dừng khi lưng võng hoặc vai đau.", safetyEn: "Stop when the lower back sags or shoulders become painful." },
  { id: "rotation", vi: "Xoay thân", en: "Torso Rotation", muscles: ["core"], secondary: ["shoulders"], pattern: "core", equipment: ["cable", "resistance_band", "machine", "dumbbell"], cueVi: "Xoay qua lồng ngực và hông theo chủ đích, giữ đầu gối ổn định.", cueEn: "Rotate deliberately through the torso and hips while keeping the knees controlled.", safetyVi: "Không giật xoắn lưng dưới với tải nặng.", safetyEn: "Do not violently twist the lower back under heavy load." },
  { id: "anti_rotation", vi: "Chống xoay", en: "Anti-Rotation Press", muscles: ["core"], secondary: ["shoulders"], pattern: "core", equipment: ["cable", "resistance_band"], cueVi: "Ép hai tay ra trước nhưng giữ ngực và hông vuông.", cueEn: "Press the hands forward while keeping the chest and hips square.", safetyVi: "Giảm tải nếu không thể giữ thân yên.", safetyEn: "Reduce resistance if the torso cannot stay still." },
  { id: "side_bend", vi: "Nghiêng thân", en: "Side Bend", muscles: ["core"], secondary: [], pattern: "core", equipment: ["dumbbell", "cable", "machine"], cueVi: "Nghiêng sang bên trong biên độ ngắn, giữ thân không xoay.", cueEn: "Bend sideways through a controlled range without rotating the torso.", safetyVi: "Không dùng tải khiến lưng dưới bị nén hoặc đau.", safetyEn: "Avoid loads that create lower-back compression or pain." },
  { id: "deadlift", vi: "Deadlift", en: "Deadlift", muscles: ["glutes", "hamstrings", "back"], secondary: ["quadriceps", "core", "forearms"], pattern: "hinge", equipment: ["barbell", "dumbbell", "smith", "trap_bar"], cueVi: "Siết thân, đẩy sàn ra xa và giữ tải gần người.", cueEn: "Brace the trunk, push the floor away, and keep the load close.", safetyVi: "Học kỹ với tải nhẹ; dừng nếu lưng mất trung lập hoặc xuất hiện đau nhói.", safetyEn: "Learn with light loads and stop if spinal position is lost or sharp pain appears." },
  { id: "farmer_carry", vi: "Xách tạ đi bộ", en: "Farmer Carry", muscles: ["full_body", "forearms"], secondary: ["core", "shoulders"], pattern: "carry", equipment: ["dumbbell", "kettlebell", "trap_bar", "barbell"], cueVi: "Đứng cao, siết thân và bước ngắn ổn định với tải hai bên.", cueEn: "Stand tall, brace, and take controlled short steps with the load at the sides.", safetyVi: "Giữ lối đi thông thoáng và đặt tải xuống có kiểm soát.", safetyEn: "Keep the path clear and set the load down under control." }
];

const equipmentName: Record<EquipmentType, LocalizedText> = {
  bodyweight: { vi: "trọng lượng cơ thể", en: "Bodyweight" },
  dumbbell: { vi: "tạ đơn", en: "Dumbbell" },
  barbell: { vi: "tạ đòn", en: "Barbell" },
  smith: { vi: "máy Smith", en: "Smith Machine" },
  cable: { vi: "cáp", en: "Cable" },
  machine: { vi: "máy", en: "Machine" },
  resistance_band: { vi: "dây kháng lực", en: "Resistance Band" },
  kettlebell: { vi: "tạ ấm", en: "Kettlebell" },
  trap_bar: { vi: "trap bar", en: "Trap Bar" },
  bench: { vi: "ghế", en: "Bench" },
  pullup_bar: { vi: "xà đơn", en: "Pull-Up Bar" }
};

function loadMode(seed: MovementSeed, equipment: EquipmentType): LoadEntryMode {
  if (seed.pattern === "carry") return "duration_distance";
  if (equipment === "bodyweight") return "bodyweight_plus";
  if (equipment === "dumbbell" || equipment === "kettlebell") return "per_hand";
  if (equipment === "resistance_band") return "reps_only";
  return "total_weight";
}

function setupInstruction(equipment: EquipmentType): LocalizedText {
  const label = equipmentName[equipment];
  return {
    vi: `Chọn mức ${label.vi} cho phép hoàn thành toàn bộ rep với kỹ thuật ổn định.`,
    en: `Choose a ${label.en.toLowerCase()} setup that allows every rep to remain controlled.`
  };
}

function movementInstruction(seed: MovementSeed): LocalizedText[] {
  const patternStep: Record<Pattern, LocalizedText> = {
    push: { vi: "Hít vào khi hạ tải; thở ra và đẩy qua biên độ kiểm soát.", en: "Inhale while lowering; exhale and press through a controlled range." },
    pull: { vi: "Giữ thân ổn định, kéo bằng khuỷu rồi trả tải chậm.", en: "Keep the torso stable, pull with the elbows, then return slowly." },
    squat: { vi: "Hít vào, siết thân, hạ hông và đứng lên qua toàn bàn chân.", en: "Inhale, brace, lower the hips, and stand through the whole foot." },
    hinge: { vi: "Đẩy hông ra sau với lưng trung lập rồi siết mông để đứng lên.", en: "Push the hips back with a neutral spine, then squeeze the glutes to stand." },
    lunge: { vi: "Ổn định bàn chân trước, hạ người có kiểm soát rồi đẩy lên.", en: "Stabilize the lead foot, lower under control, then drive up." },
    isolation: { vi: "Cố định các khớp không cần thiết và di chuyển chậm tại khớp mục tiêu.", en: "Stabilize non-working joints and move smoothly at the target joint." },
    core: { vi: "Thở đều, siết bụng và chỉ dùng biên độ giữ được cột sống kiểm soát.", en: "Breathe steadily, brace, and use only the range where the spine stays controlled." },
    carry: { vi: "Giữ tư thế cao, bước đều và đặt tải xuống có kiểm soát.", en: "Stay tall, walk evenly, and set the load down under control." }
  };
  return [
    { vi: "Thiết lập vị trí và kiểm tra không gian xung quanh trước khi bắt đầu.", en: "Set the position and check the surrounding space before starting." },
    patternStep[seed.pattern],
    { vi: seed.cueVi, en: seed.cueEn },
    { vi: "Kết thúc set khi kỹ thuật bắt đầu thay đổi rõ rệt.", en: "End the set when technique begins to change noticeably." }
  ];
}

function variantName(seed: MovementSeed, equipment: EquipmentType): LocalizedText {
  if (equipment === "bodyweight") return { vi: `${seed.vi} với trọng lượng cơ thể`, en: `Bodyweight ${seed.en}` };
  return {
    vi: `${seed.vi} với ${equipmentName[equipment].vi}`,
    en: `${equipmentName[equipment].en} ${seed.en}`
  };
}

function variantEquipment(seed: MovementSeed, equipment: EquipmentType): EquipmentType[] {
  const result: EquipmentType[] = [equipment];
  if (seed.needsBench && !["machine", "bodyweight"].includes(equipment)) result.push("bench");
  if (seed.id === "pull_up") result.push("pullup_bar");
  return [...new Set(result)];
}

export const MOVEMENTS: Movement[] = movementSeeds.map((seed) => ({
  id: seed.id,
  name: { vi: seed.vi, en: seed.en },
  aliases: [seed.en.toLowerCase(), seed.vi.toLowerCase()],
  primaryMuscles: seed.muscles,
  secondaryMuscles: seed.secondary ?? [],
  pattern: seed.pattern,
  description: {
    vi: `Nhóm động tác ${seed.vi.toLowerCase()} với nhiều lựa chọn dụng cụ và lịch sử riêng cho từng biến thể.`,
    en: `${seed.en} movement family with equipment alternatives and separate history for each variation.`
  },
  reviewStatus: "reviewed",
  contentVersion: 1
}));

export const EXERCISE_VARIANTS: ExerciseVariant[] = movementSeeds.flatMap((seed) =>
  seed.equipment.map((equipment) => {
    const name = variantName(seed, equipment);
    const variantId = `${seed.id}__${equipment}`;
    const referenceImage = freeExerciseMedia[variantId];
    return {
      id: variantId,
      movementId: seed.id,
      name,
      equipment: variantEquipment(seed, equipment),
      difficulty: "beginner",
      loadEntryMode: loadMode(seed, equipment),
      instructions: [setupInstruction(equipment), ...movementInstruction(seed)],
      cues: [{ vi: seed.cueVi, en: seed.cueEn }],
      commonMistakes: [
        { vi: "Dùng quán tính hoặc chọn tải khiến biên độ mất kiểm soát.", en: "Using momentum or a load that removes control of the range." },
        { vi: "Tiếp tục set dù kỹ thuật đã thay đổi rõ rệt.", en: "Continuing the set after technique has noticeably changed." }
      ],
      safety: [
        { vi: seed.safetyVi, en: seed.safetyEn },
        { vi: "Dừng ngay nếu xuất hiện đau nhói, tê hoặc chóng mặt.", en: "Stop immediately for sharp pain, numbness, or dizziness." }
      ],
      media: [
        ...(referenceImage ? [{
          id: `media_${seed.id}_${equipment}_image`,
          type: "image" as const,
          url: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${referenceImage.path}`,
          sourceId: "free-exercise-db",
          title: { vi: `Hình tham khảo: ${referenceImage.title}`, en: `Reference: ${referenceImage.title}` },
          onlineOnly: true,
          reviewStatus: "reviewed" as const
        }] : [])
      ],
      videoGuides: [videoGuide(variantId, name)],
      sourceIds: referenceImage ? ["gym-local-original", "free-exercise-db", "youtube-video-guides"] : ["gym-local-original", "youtube-video-guides"],
      reviewStatus: "reviewed",
      contentVersion: 1
    } satisfies ExerciseVariant;
  })
);

export const EQUIPMENT_OPTIONS = Object.entries(equipmentName).map(([id, name]) => ({
  id: id as EquipmentType,
  name
}));

export function getMovement(id: string): Movement | undefined {
  return MOVEMENTS.find((movement) => movement.id === id);
}

export function getVariant(id: string): ExerciseVariant | undefined {
  return EXERCISE_VARIANTS.find((variant) => variant.id === id);
}

export function getVariantsForMovement(movementId: string): ExerciseVariant[] {
  return EXERCISE_VARIANTS.filter((variant) => variant.movementId === movementId);
}

export function searchCatalog(query: string, muscle?: MuscleGroup, equipment?: EquipmentType): Movement[] {
  const normalized = query.trim().toLocaleLowerCase("vi");
  return MOVEMENTS.filter((movement) => {
    const variants = getVariantsForMovement(movement.id);
    const matchesText = !normalized || [movement.name.vi, movement.name.en, ...movement.aliases]
      .some((value) => value.toLocaleLowerCase("vi").includes(normalized));
    const matchesMuscle = !muscle || movement.primaryMuscles.includes(muscle) || movement.secondaryMuscles.includes(muscle);
    const matchesEquipment = !equipment || variants.some((variant) => variant.equipment.includes(equipment));
    return matchesText && matchesMuscle && matchesEquipment;
  });
}

export function rankVariantsForEquipment(movementId: string, available: EquipmentType[]): ExerciseVariant[] {
  const set = new Set(available);
  return getVariantsForMovement(movementId).sort((a, b) => {
    const aReady = a.equipment.every((item) => set.has(item));
    const bReady = b.equipment.every((item) => set.has(item));
    return Number(bReady) - Number(aReady) || a.name.vi.localeCompare(b.name.vi, "vi");
  });
}
