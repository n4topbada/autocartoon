import type { Metadata } from "next";
import LegalDocumentPage from "@/components/LegalDocumentPage";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";

export const metadata: Metadata = {
  title: "개인정보처리방침 | 워니바나나봇",
  description: LEGAL_DOCUMENTS.privacy.description,
};

export default function PrivacyPage() {
  return <LegalDocumentPage document={LEGAL_DOCUMENTS.privacy} />;
}
