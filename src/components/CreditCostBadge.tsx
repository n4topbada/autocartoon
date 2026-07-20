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
  const numericAmount = (credits ?? 0).toLocaleString("ko-KR");
  const amount = label ?? `${numericAmount}C`;
  const display = `${approximate ? "약 " : ""}${amount}`;
  const accessibleAmount = label ?? numericAmount;
  const accessibleLabel = `${approximate ? "약 " : ""}${accessibleAmount} 크레딧 사용`;

  return (
    <span
      className={`${styles.badge}${className ? ` ${className}` : ""}`}
      aria-label={accessibleLabel}
    >
      <LuCoins aria-hidden="true" size={11} />
      <span>{display}</span>
    </span>
  );
}
