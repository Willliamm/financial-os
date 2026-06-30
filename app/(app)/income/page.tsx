"use client";

import { useTranslation } from "react-i18next";
import { ListScreen } from "@/features/data-studio/list-screen";

export default function IncomePage() {
  const { t } = useTranslation();
  return (
    <ListScreen
      type="income_source"
      title={t("income:title")}
      description={t("income:description")}
    />
  );
}
