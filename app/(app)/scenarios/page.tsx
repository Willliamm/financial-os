"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ListScreen } from "@/features/data-studio/list-screen";

export default function ScenariosPage() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <ListScreen
      type="scenario"
      title={t("scenarios:list.title")}
      description={t("scenarios:list.description")}
      onRowClick={(entity) => router.push(`/scenario?id=${entity.id}`)}
    />
  );
}
