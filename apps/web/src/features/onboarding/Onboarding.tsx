import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Dumbbell, Languages, LockKeyhole, Salad, Sparkles } from "lucide-react";
import { Button, Card, Chip, Field, Notice, ProgressBar } from "@gym/ui";
import { createId, type Difficulty, type EquipmentType, type Goal, type Profile } from "@gym/contracts";
import { EQUIPMENT_OPTIONS } from "@gym/catalog";
import { estimateNutritionTarget } from "@gym/nutrition";
import { useGymStore } from "../../store/useGymStore";
import { Brand } from "../../components/Brand";
import { useDocumentLanguage } from "../../lib/i18n";

const goalOptions: Array<{ id: Goal; vi: string; en: string }> = [
  { id: "hypertrophy", vi: "Tăng cơ", en: "Build muscle" },
  { id: "strength", vi: "Tăng sức mạnh", en: "Get stronger" },
  { id: "fat_loss", vi: "Giảm mỡ", en: "Lose fat" },
  { id: "general", vi: "Sức khỏe chung", en: "General fitness" }
];

const experienceOptions: Array<{ id: Difficulty; vi: string; en: string }> = [
  { id: "beginner", vi: "Mới bắt đầu", en: "Beginner" },
  { id: "intermediate", vi: "Đã tập một thời gian", en: "Intermediate" },
  { id: "advanced", vi: "Nâng cao", en: "Advanced" }
];

function recommendedTemplates(days: number): string[] {
  if (days >= 6) return ["tpl_push", "tpl_pull", "tpl_legs"];
  if (days >= 4) return ["tpl_upper_hypertrophy", "tpl_lower_hypertrophy"];
  return ["tpl_full_body_a", "tpl_full_body_b"];
}

function optionalPositiveNumber(value: string, integer = false): number | undefined {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return integer ? Math.round(parsed) : parsed;
}

export function Onboarding() {
  const completeOnboarding = useGymStore((state) => state.completeOnboarding);
  const busy = useGymStore((state) => state.busy);
  const [step, setStep] = useState(1);
  const [locale, setLocale] = useState<"vi" | "en">("vi");
  const [displayName, setDisplayName] = useState("");
  const [goal, setGoal] = useState<Goal>("hypertrophy");
  const [experience, setExperience] = useState<Difficulty>("beginner");
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [locationName, setLocationName] = useState("Phòng gym của tôi");
  const [equipment, setEquipment] = useState<EquipmentType[]>(["bodyweight", "dumbbell", "bench", "cable", "machine", "smith"]);
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"female" | "male" | "unspecified">("unspecified");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [activityFactor, setActivityFactor] = useState<1.2 | 1.375 | 1.55 | 1.725 | 1.9>(1.55);
  const [error, setError] = useState<string>();

  useDocumentLanguage(locale);

  const isVi = locale === "vi";
  const nutritionTarget = useMemo(() => {
    if (!age || !height || !weight || sex === "unspecified") return undefined;
    const parsedAge = optionalPositiveNumber(age, true);
    const parsedHeight = optionalPositiveNumber(height);
    const parsedWeight = optionalPositiveNumber(weight);
    if (!parsedAge || !parsedHeight || !parsedWeight) return undefined;
    try {
      return estimateNutritionTarget({
        age: parsedAge,
        heightCm: parsedHeight,
        weightKg: parsedWeight,
        biologicalSex: sex,
        activityFactor,
        goal
      });
    } catch {
      return undefined;
    }
  }, [activityFactor, age, goal, height, sex, weight]);

  const toggleEquipment = (id: EquipmentType) => {
    setEquipment((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  };

  const finish = async () => {
    setError(undefined);
    if (!displayName.trim()) {
      setStep(1);
      setError(isVi ? "Hãy nhập tên bạn muốn hiển thị." : "Enter a display name.");
      return;
    }
    if (!equipment.length) {
      setStep(2);
      setError(isVi ? "Chọn ít nhất một loại dụng cụ." : "Choose at least one equipment type.");
      return;
    }
    const timestamp = new Date().toISOString();
    const locationId = createId("location");
    const profile: Profile = {
      id: "profile",
      displayName: displayName.trim(),
      locale,
      units: "metric",
      goal,
      experience,
      daysPerWeek,
      age: optionalPositiveNumber(age, true),
      biologicalSex: sex,
      heightCm: optionalPositiveNumber(height),
      weightKg: optionalPositiveNumber(weight),
      activityFactor,
      nutritionTarget,
      locations: [{ id: locationId, name: locationName.trim() || "My gym", equipment }],
      activeLocationId: locationId,
      onboardingComplete: true,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    try {
      await completeOnboarding(profile, recommendedTemplates(daysPerWeek));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save setup");
    }
  };

  return (
    <main className="onboarding">
      <div className="onboarding__masthead">
        <Brand />
        <button className="language-switch" type="button" aria-label={isVi ? "Chuyển sang English" : "Switch to Tiếng Việt"} onClick={() => setLocale(isVi ? "en" : "vi")}>
          <Languages size={17} /> {isVi ? "English" : "Tiếng Việt"}
        </button>
      </div>

      <div className="onboarding__layout">
        <section className="onboarding__intro">
          <span className="hero-kicker"><Sparkles size={16} /> {isVi ? "Không tài khoản. Không phí." : "No account. No fees."}</span>
          <h1>{isVi ? "Tập thông minh hơn. Dữ liệu vẫn là của bạn." : "Train smarter. Keep your data yours."}</h1>
          <p>{isVi ? "Gym Local ghép mỗi động tác với nhiều lựa chọn dụng cụ, ghi lại chính xác biến thể bạn đã tập và hoạt động ngay cả khi mất mạng." : "Gym Local pairs every movement with equipment alternatives, remembers the exact variation you trained, and works offline."}</p>
          <div className="privacy-pill"><LockKeyhole size={18} /><span>{isVi ? "Mọi dữ liệu được lưu ngay trên thiết bị này." : "Everything is stored on this device."}</span></div>
        </section>

        <Card className="onboarding__card">
          <div className="step-row">
            <span>{isVi ? `Bước ${step} / 3` : `Step ${step} of 3`}</span>
            <span>{Math.round((step / 3) * 100)}%</span>
          </div>
          <ProgressBar value={(step / 3) * 100} label={isVi ? "Tiến độ thiết lập" : "Setup progress"} />

          {error ? <div role="alert"><Notice tone="warning">{error}</Notice></div> : null}

          {step === 1 ? (
            <div className="onboarding__step">
              <div className="step-heading">
                <span className="step-icon"><Dumbbell size={22} /></span>
                <div><h2>{isVi ? "Mục tiêu tập luyện" : "Your training goal"}</h2><p>{isVi ? "Dùng để gợi ý lịch tập khởi đầu." : "Used to suggest your starting routine."}</p></div>
              </div>
              <Field label={isVi ? "Tên hiển thị" : "Display name"}>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={isVi ? "Ví dụ: Minh" : "e.g. Alex"} autoFocus />
              </Field>
              <div className="field">
                <span className="field__label">{isVi ? "Bạn muốn tập để" : "I want to"}</span>
                <div className="option-grid option-grid--2" role="group" aria-label={isVi ? "Mục tiêu tập luyện" : "Training goal"}>
                  {goalOptions.map((option) => <Chip key={option.id} active={goal === option.id} onClick={() => setGoal(option.id)}>{goal === option.id ? <Check size={15} /> : null}{isVi ? option.vi : option.en}</Chip>)}
                </div>
              </div>
              <div className="field">
                <span className="field__label">{isVi ? "Kinh nghiệm" : "Experience"}</span>
                <div className="option-grid" role="group" aria-label={isVi ? "Kinh nghiệm tập luyện" : "Training experience"}>
                  {experienceOptions.map((option) => <Chip key={option.id} active={experience === option.id} onClick={() => setExperience(option.id)}>{isVi ? option.vi : option.en}</Chip>)}
                </div>
              </div>
              <div className="field">
                <span className="field__label">{isVi ? "Số buổi mỗi tuần" : "Days per week"}</span>
                <div className="day-picker" role="group" aria-label={isVi ? "Số buổi mỗi tuần" : "Days per week"}>{[2, 3, 4, 5, 6].map((day) => <button key={day} type="button" className={daysPerWeek === day ? "active" : ""} aria-pressed={daysPerWeek === day} aria-label={isVi ? `${day} buổi mỗi tuần` : `${day} days per week`} onClick={() => setDaysPerWeek(day)}>{day}</button>)}</div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="onboarding__step">
              <div className="step-heading"><span className="step-icon"><Dumbbell size={22} /></span><div><h2>{isVi ? "Dụng cụ bạn có" : "Available equipment"}</h2><p>{isVi ? "App sẽ ưu tiên biến thể bạn có thể tập ngay." : "The app prioritizes variations you can do now."}</p></div></div>
              <Field label={isVi ? "Tên địa điểm" : "Location name"}>
                <input value={locationName} onChange={(event) => setLocationName(event.target.value)} />
              </Field>
              <div className="equipment-grid" role="group" aria-label={isVi ? "Dụng cụ hiện có" : "Available equipment"}>
                {EQUIPMENT_OPTIONS.map((option) => (
                  <button type="button" key={option.id} className={equipment.includes(option.id) ? "equipment-option equipment-option--active" : "equipment-option"} aria-pressed={equipment.includes(option.id)} onClick={() => toggleEquipment(option.id)}>
                    <span className="equipment-option__check">{equipment.includes(option.id) ? <Check size={14} /> : null}</span>
                    <span>{option.name[locale]}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="onboarding__step">
              <div className="step-heading"><span className="step-icon"><Salad size={22} /></span><div><h2>{isVi ? "Mục tiêu dinh dưỡng" : "Nutrition target"}</h2><p>{isVi ? "Không bắt buộc. Bạn có thể chỉnh lại bất cứ lúc nào." : "Optional. You can change this anytime."}</p></div></div>
              <div className="form-grid">
                <Field label={isVi ? "Tuổi" : "Age"}><input type="number" inputMode="numeric" min="18" max="100" value={age} onChange={(event) => setAge(event.target.value)} placeholder="28" /></Field>
                <Field label={isVi ? "Giới tính sinh học" : "Biological sex"}>
                  <select value={sex} onChange={(event) => setSex(event.target.value as typeof sex)}><option value="unspecified">—</option><option value="female">{isVi ? "Nữ" : "Female"}</option><option value="male">{isVi ? "Nam" : "Male"}</option></select>
                </Field>
                <Field label={isVi ? "Chiều cao (cm)" : "Height (cm)"}><input type="number" inputMode="decimal" min="1" step="0.1" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="170" /></Field>
                <Field label={isVi ? "Cân nặng (kg)" : "Weight (kg)"}><input type="number" inputMode="decimal" min="1" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="65" /></Field>
              </div>
              <Field label={isVi ? "Mức độ vận động" : "Activity level"}>
                <select value={activityFactor} onChange={(event) => setActivityFactor(Number(event.target.value) as typeof activityFactor)}>
                  <option value="1.2">{isVi ? "Ít vận động" : "Sedentary"}</option>
                  <option value="1.375">{isVi ? "Nhẹ · 1–3 buổi/tuần" : "Light · 1–3 days/week"}</option>
                  <option value="1.55">{isVi ? "Vừa · 3–5 buổi/tuần" : "Moderate · 3–5 days/week"}</option>
                  <option value="1.725">{isVi ? "Cao · 6–7 buổi/tuần" : "High · 6–7 days/week"}</option>
                  <option value="1.9">{isVi ? "Rất cao" : "Very high"}</option>
                </select>
              </Field>
              {nutritionTarget ? (
                <div className="nutrition-preview">
                  <div><strong>{nutritionTarget.calories}</strong><span>kcal</span></div>
                  <div><strong>{nutritionTarget.protein}g</strong><span>protein</span></div>
                  <div><strong>{nutritionTarget.carbs}g</strong><span>carb</span></div>
                  <div><strong>{nutritionTarget.fat}g</strong><span>fat</span></div>
                </div>
              ) : <Notice>{isVi ? "Để trống nếu bạn chỉ muốn dùng phần tập luyện." : "Leave blank if you only want workout tracking."}</Notice>}
              <p className="fine-print">{isVi ? "Con số chỉ là ước tính khởi đầu, không thay thế tư vấn y tế hoặc dinh dưỡng chuyên môn." : "These are starting estimates, not medical or professional nutrition advice."}</p>
            </div>
          ) : null}

          <div className="onboarding__actions">
            {step > 1 ? <Button variant="ghost" onClick={() => setStep((value) => value - 1)}><ArrowLeft size={18} />{isVi ? "Quay lại" : "Back"}</Button> : <span />}
            {step < 3 ? <Button onClick={() => setStep((value) => value + 1)}>{isVi ? "Tiếp tục" : "Continue"}<ArrowRight size={18} /></Button> : <Button disabled={busy} onClick={() => void finish()}>{busy ? (isVi ? "Đang lưu…" : "Saving…") : (isVi ? "Bắt đầu" : "Get started")}<Check size={18} /></Button>}
          </div>
        </Card>
      </div>
    </main>
  );
}
