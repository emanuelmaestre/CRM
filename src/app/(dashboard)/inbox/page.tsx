import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { InboxCliente } from "./inbox-cliente";
import pagesConfig from "@/config/pages.json";

export const metadata = { title: pagesConfig.inbox.metadataTitle };

export default function InboxPage() {
  return (
    <div>
      <PageHeader
        title={pagesConfig.inbox.title}
        description={pagesConfig.inbox.description}
      />
      <InboxCliente />
    </div>
  );
}
