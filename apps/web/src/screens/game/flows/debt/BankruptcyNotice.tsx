import { useT } from "../../../../i18n/index.ts";
import "./DebtView.css";

// The short result after a bankruptcy (spec 5.2): shown in the board centre or the log for one
// beat. `creditorName` is null when the assets went to the bank.
export function BankruptcyNotice({
  playerName,
  creditorName,
}: {
  playerName: string;
  creditorName: string | null;
}) {
  const t = useT();
  return (
    <div className="debt-view debt-view--notice" role="status">
      <p className="turn-area__status">{t("debt.out", { name: playerName })}</p>
      <p className="turn-area__sub">
        {creditorName === null ? t("debt.outBank") : t("debt.outPlayer", { name: creditorName })}
      </p>
    </div>
  );
}
