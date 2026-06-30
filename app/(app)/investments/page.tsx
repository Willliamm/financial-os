"use client";

import { useTranslation } from "react-i18next";
import { ListScreen } from "@/features/data-studio/list-screen";

export default function InvestmentsPage() {
  const { t } = useTranslation();
  return (
    <ListScreen
      type="investment_account"
      title={t("investments:title")}
      description={t("investments:description")}
    />
  );
}
