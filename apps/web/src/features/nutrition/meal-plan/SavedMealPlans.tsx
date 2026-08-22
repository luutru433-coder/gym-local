import type { SavedMealPlan } from "@gym/contracts";
import { CalendarCheck, NotebookPen, Trash2 } from "lucide-react";
import { Button, Card, EmptyState, SectionTitle } from "@gym/ui";

interface SavedMealPlansProps {
  plans: SavedMealPlan[];
  busy?: boolean;
  onLogDays: (planId: string, dayIndexes: number[]) => Promise<unknown>;
  onDelete: (planId: string) => Promise<void>;
}

export function SavedMealPlans({ plans, busy, onLogDays, onDelete }: SavedMealPlansProps) {
  return (
    <section className="saved-meal-plans">
      <SectionTitle eyebrow="Lưu trên thiết bị" title="Thực đơn đã lưu" />
      {plans.length ? (
        <div className="saved-meal-plans__grid">
          {plans.map((plan) => (
            <Card className="saved-meal-plan-card" key={plan.id}>
              <div>
                <h3>{plan.name.vi}</h3>
                <p>{plan.durationDays} ngày · {plan.days.reduce((sum, day) => sum + day.meals.length, 0)} bữa · kho {plan.sourcePackVersion}</p>
              </div>
              <div className="saved-meal-plan-card__actions">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void onLogDays(plan.id, [0])}
                >
                  <NotebookPen size={15} />
                  Ghi ngày đầu
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Ghi toàn bộ thực đơn này vào nhật ký? Các bữa đã ghi trước đó sẽ được bỏ qua.")) {
                      void onLogDays(plan.id, plan.days.map((day) => day.dayIndex));
                    }
                  }}
                >
                  <CalendarCheck size={15} />
                  Ghi cả tuần
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Xóa ${plan.name.vi}`}
                  onClick={() => {
                    if (window.confirm(`Xóa thực đơn “${plan.name.vi}”? Nhật ký đã ghi sẽ không bị xóa.`)) void onDelete(plan.id);
                  }}
                >
                  <Trash2 size={15} />
                  Xóa
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CalendarCheck size={22} />}
          title="Chưa có thực đơn đã lưu"
          body="Tạo một phương án 7 ngày, kiểm tra món và danh sách mua sắm, sau đó lưu trên thiết bị."
        />
      )}
    </section>
  );
}
