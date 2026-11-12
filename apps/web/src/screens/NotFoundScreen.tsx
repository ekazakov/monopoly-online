import { Link } from "@tanstack/react-router";
import { useT } from "../i18n/index.ts";

export function NotFoundScreen() {
  const t = useT();
  return (
    <main className="screen">
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.text")}</p>
      <Link to="/">{t("notFound.home")}</Link>
    </main>
  );
}
