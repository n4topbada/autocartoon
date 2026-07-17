import { LuCoins } from "react-icons/lu";
import styles from "./CreditCostBadge.module.css";

type CreditCostBadgeProps = {
  credits?: number;
  label?: string;
  approximate?: boolean;
  className?: string;
};

export default function CreditCostBadge({
  credits,
  label,
  approximate = false,
  className,
}: CreditCostBadgeProps) {
  const amount = label ?? (credits ?? 0).toLocaleString("ko-KR");
  const display = `${approximate ? "약 " : ""}${amount}`;
  const accessibleLabel = `${display} 크레딧 사용`;

  return (
    <span
      className={`${styles.badge}${className ? ` ${className}` : ""}`}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      <LuCoins aria-hidden="true" size={11} />
      <span>{display}</span>
    </span>
  );
}
