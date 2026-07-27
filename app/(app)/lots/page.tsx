"use client";

import { useTranslation } from "react-i18next";
import { ListScreen } from "@/features/data-studio/list-screen";

export default function LotsPage() {
  const { t } = useTranslation();
  return (
    <ListScreen
      type="lot"
      title={t("portfolio:lotsPage.title")}
      description={t("portfolio:lotsPage.description")}
    />
  );
}
