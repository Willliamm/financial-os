"use client";

import { useTranslation } from "react-i18next";
import { ListScreen } from "@/features/data-studio/list-screen";

export default function LoansPage() {
  const { t } = useTranslation();
  return (
    <ListScreen
      type="loan"
      title={t("loans:title")}
      description={t("loans:description")}
    />
  );
}
