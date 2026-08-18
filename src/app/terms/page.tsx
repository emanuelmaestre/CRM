import { LegalWizardDocument } from "@/shared/legal/LegalWizardDocument";
import { getLegalDocument } from "@/shared/legal/legal-documents";

const document = getLegalDocument("en", "terms");

export const metadata = {
  title: document.metadataTitle,
  description: document.description,
};

export default function TermsPage() {
  return <LegalWizardDocument document={document} />;
}
