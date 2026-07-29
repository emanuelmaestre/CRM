import pagesConfig from "@/config/pages.json";
import { SectionTabs } from "@/shared/design-system/primitives/SectionTabs";

export function TarefasTabs({ active }: { active: "tarefas" | "agenda" }) {
  return (
    <SectionTabs
      tabs={pagesConfig.tarefas.tabs}
      active={active}
      ariaLabel={pagesConfig.tarefas.navigationAriaLabel}
    />
  );
}
