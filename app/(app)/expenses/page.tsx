"use client";

import { useTranslation } from "react-i18next";
import { ListScreen } from "@/features/data-studio/list-screen";

export default function ExpensesPage() {
  const { t } = useTranslation();
  return (
    <ListScreen
      type="expense"
      title={t("expenses:title")}
      description={t("expenses:description")}
    />
  );
}
