import { LegalWizardDocument } from "@/shared/legal/LegalWizardDocument";
import { getLegalDocument } from "@/shared/legal/legal-documents";

const document = getLegalDocument("pt", "privacy");

export const metadata = {
  title: document.metadataTitle,
  description: document.description,
};

export default function PrivacidadePage() {
  return <LegalWizardDocument document={document} />;
}
