import Link from "next/link";
import { LuArrowLeft, LuFileCheck2 } from "react-icons/lu";
import type { LegalDocument } from "@/lib/legal-documents";
import LegalFooter from "./LegalFooter";
import styles from "./LegalDocumentPage.module.css";

const legalTabs = [
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보" },
  { href: "/refund", label: "환불정책" },
] as const;

export default function LegalDocumentPage({ document }: { document: LegalDocument }) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.backButton} href="/" aria-label="서비스로 돌아가기" title="서비스로 돌아가기">
            <LuArrowLeft size={19} aria-hidden="true" />
          </Link>
          <div className={styles.heading}>
            <span className={styles.eyebrow}>Policy</span>
            <h1>{document.title}</h1>
            <p>{document.description}</p>
          </div>
          <LuFileCheck2 className={styles.headerIcon} aria-hidden="true" />
        </div>
        <nav className={styles.tabs} aria-label="정책 문서">
          {legalTabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={document.slug === tab.href.slice(1) ? styles.activeTab : undefined}
              aria-current={document.slug === tab.href.slice(1) ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>

      <article className={styles.document}>
        <div className={styles.statusBar}>
          <strong>운영 전 초안</strong>
          <span>시행 예정일 {document.effectiveDate}</span>
        </div>
        <p className={styles.draftNotice}>
          서비스 구조를 기준으로 작성한 임시 문안입니다. 결제 개시 전 사업자 정보, 위탁 계약,
          국외 이전과 법률 검토 결과를 반영해 최종 확정합니다.
        </p>

        <nav className={styles.contents} aria-label="문서 목차">
          {document.sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>{section.title}</a>
          ))}
        </nav>

        <div className={styles.sections}>
          {document.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.items && (
                <ul>
                  {section.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>
      </article>

      <LegalFooter />
    </main>
  );
}
