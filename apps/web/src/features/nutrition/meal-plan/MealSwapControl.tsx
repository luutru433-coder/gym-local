import { RefreshCw } from "lucide-react";
import { Button } from "@gym/ui";

interface MealSwapControlProps {
  disabled?: boolean;
  onSwap: () => void;
}

export function MealSwapControl({ disabled, onSwap }: MealSwapControlProps) {
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={disabled}
      title="Đổi món và cân đối lại mục tiêu của cả tuần"
      aria-label="Đổi món và cân đối lại cả tuần"
      onClick={onSwap}
    >
      <RefreshCw size={15} />
      Đổi món
    </Button>
  );
}
