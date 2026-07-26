"use client";

import { useTranslation } from "react-i18next";
import { ListScreen } from "@/features/data-studio/list-screen";

export default function ObservationsPage() {
  const { t } = useTranslation();
  return (
    <ListScreen
      type="observation"
      title={t("observations:title")}
      description={t("observations:description")}
    />
  );
}
