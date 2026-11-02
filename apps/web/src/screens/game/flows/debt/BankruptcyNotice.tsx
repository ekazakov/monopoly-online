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
  return (
    <div className="debt-view debt-view--notice" role="status">
      <p className="turn-area__status">{playerName} is out of the game</p>
      <p className="turn-area__sub">
        {creditorName === null
          ? "Everything goes to the bank. The properties are auctioned."
          : `${creditorName} receives the cash and the properties.`}
      </p>
    </div>
  );
}
