import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { InboxCliente } from "./inbox-cliente";

export const metadata = { title: "Mensagens" };

export default function InboxPage() {
  return (
    <div>
      <PageHeader
        title="Mensagens"
        description="Conversas unificadas — WhatsApp, Shopee, Mercado Livre e TikTok Shop"
      />
      <InboxCliente />
    </div>
  );
}
