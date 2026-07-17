import Link from "next/link";
import styles from "./LegalFooter.module.css";

const links = [
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/refund", label: "환불정책" },
] as const;

export default function LegalFooter() {
  return (
    <footer className={styles.footer}>
      <nav aria-label="서비스 정책">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
      <p>워니프레임 · 국내 서비스 운영 전 정책 초안</p>
    </footer>
  );
}
