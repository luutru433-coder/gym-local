import type { AsianCuisine } from "@gym/contracts";
import { Chip, Field } from "@gym/ui";

export type MealPlanDiet = "all" | "vegetarian" | "vegan";

export interface MealPlanFilterValue {
  startDate: string;
  includeSnack: boolean;
  cuisines: AsianCuisine[];
  diet: MealPlanDiet;
  excludedAllergens: string[];
  seed: string;
}

interface MealPlanFiltersProps {
  value: MealPlanFilterValue;
  disabled?: boolean;
  onChange: (value: MealPlanFilterValue) => void;
}

const cuisineOptions: Array<{ id: AsianCuisine; label: string }> = [
  { id: "vietnamese", label: "Việt Nam" },
  { id: "chinese", label: "Trung Hoa" },
  { id: "japanese", label: "Nhật Bản" },
  { id: "korean", label: "Hàn Quốc" },
  { id: "thai", label: "Thái Lan" },
  { id: "taiwanese", label: "Đài Loan" },
  { id: "indian", label: "Ấn Độ" },
  { id: "southeast_asian", label: "Đông Nam Á khác" }
];

const allergenOptions = [
  ["egg", "Trứng"],
  ["milk", "Sữa"],
  ["gluten", "Gluten"],
  ["soy", "Đậu nành"],
  ["peanut", "Đậu phộng"],
  ["tree_nut", "Hạt cây"],
  ["fish", "Cá"],
  ["shellfish", "Hải sản có vỏ"],
  ["sesame", "Mè"]
] as const;

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function MealPlanFilters({ value, disabled, onChange }: MealPlanFiltersProps) {
  return (
    <div className="meal-plan-filters" aria-label="Bộ lọc thực đơn 7 ngày">
      <div className="meal-plan-filters__primary">
        <Field label="Ngày bắt đầu">
          <input
            type="date"
            value={value.startDate}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, startDate: event.target.value })}
          />
        </Field>
        <Field label="Chế độ ăn">
          <select
            value={value.diet}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, diet: event.target.value as MealPlanDiet })}
          >
            <option value="all">Không giới hạn</option>
            <option value="vegetarian">Ăn chay</option>
            <option value="vegan">Thuần chay</option>
          </select>
        </Field>
        <label className="meal-plan-filters__snack">
          <input
            type="checkbox"
            checked={value.includeSnack}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, includeSnack: event.target.checked })}
          />
          <span>Thêm bữa phụ mỗi ngày</span>
        </label>
      </div>

      <fieldset disabled={disabled}>
        <legend>Nền ẩm thực</legend>
        <div className="meal-plan-chip-list">
          {cuisineOptions.map((option) => (
            <Chip
              key={option.id}
              active={value.cuisines.includes(option.id)}
              onClick={() => onChange({ ...value, cuisines: toggle(value.cuisines, option.id) })}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>Loại trừ dị ứng</legend>
        <div className="meal-plan-chip-list">
          {allergenOptions.map(([id, label]) => (
            <Chip
              key={id}
              active={value.excludedAllergens.includes(id)}
              onClick={() => onChange({ ...value, excludedAllergens: toggle(value.excludedAllergens, id) })}
            >
              {label}
            </Chip>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
