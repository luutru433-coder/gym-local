import { Dumbbell } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="Gym Local">
      <span className="brand__mark"><Dumbbell size={compact ? 18 : 22} strokeWidth={2.6} /></span>
      <span className="brand__name">GYM<span>LOCAL</span></span>
    </div>
  );
}
