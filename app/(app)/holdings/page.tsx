"use client";

import { useTranslation } from "react-i18next";
import { ListScreen } from "@/features/data-studio/list-screen";

export default function HoldingsPage() {
  const { t } = useTranslation();
  return (
    <ListScreen
      type="holding"
      title={t("portfolio:holdingsPage.title")}
      description={t("portfolio:holdingsPage.description")}
    />
  );
}
