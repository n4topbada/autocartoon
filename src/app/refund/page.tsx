import type { Metadata } from "next";
import LegalDocumentPage from "@/components/LegalDocumentPage";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";

export const metadata: Metadata = {
  title: "크레딧 및 환불정책 | 워니바나나봇",
  description: LEGAL_DOCUMENTS.refund.description,
};

export default function RefundPage() {
  return <LegalDocumentPage document={LEGAL_DOCUMENTS.refund} />;
}
