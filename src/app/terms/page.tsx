import type { Metadata } from "next";
import LegalDocumentPage from "@/components/LegalDocumentPage";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";

export const metadata: Metadata = {
  title: "서비스 이용약관 | 워니바나나봇",
  description: LEGAL_DOCUMENTS.terms.description,
};

export default function TermsPage() {
  return <LegalDocumentPage document={LEGAL_DOCUMENTS.terms} />;
}
