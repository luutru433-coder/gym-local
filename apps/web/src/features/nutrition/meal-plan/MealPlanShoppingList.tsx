import type { MealPlanShoppingItem } from "@gym/contracts";
import { Check, ShoppingBasket } from "lucide-react";
import { Card, EmptyState, SectionTitle } from "@gym/ui";
import { formatNumber } from "../../../lib/i18n";

const groupLabels = {
  starch: "Tinh bột",
  meat: "Thịt",
  seafood: "Cá và hải sản",
  eggs: "Trứng",
  plant_protein: "Đạm thực vật",
  vegetables: "Rau",
  fruit: "Trái cây",
  dairy: "Sữa",
  fats: "Chất béo",
  seasonings: "Gia vị"
} as const;

export function MealPlanShoppingList({ items }: { items: MealPlanShoppingItem[] }) {
  return (
    <section className="meal-plan-shopping">
      <SectionTitle eyebrow="Tính trên cả tuần" title="Danh sách cần mua" />
      {items.length ? (
        <Card>
          <ul>
            {items.map((item) => (
              <li key={item.foodId}>
                <span className="meal-plan-shopping__icon"><ShoppingBasket size={17} /></span>
                <span><strong>{item.nameSnapshot.vi}</strong><small>{groupLabels[item.groupId]}</small></span>
                <strong>{formatNumber(item.missingGrams, "vi", 0)} g</strong>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState
          icon={<Check size={22} />}
          title="Nguyên liệu đã đủ"
          body="Theo số lượng pantry hiện tại, kế hoạch này chưa cần bổ sung nguyên liệu. Pantry không bị tự động trừ khi tạo kế hoạch."
        />
      )}
    </section>
  );
}
