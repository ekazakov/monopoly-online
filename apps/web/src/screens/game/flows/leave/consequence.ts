/**
 * What resigning does (spec 8.7 and the design board Dialogs, Leave game). The properties go to
 * the player the resigner owes, or else to the bank for auction. With two active players
 * the other one wins, so the game ends.
 */
export function consequenceText(name: string | null, activePlayers: number): string {
  const who = name ?? "The chosen player";
  const rest =
    activePlayers <= 2
      ? "Only one player is left, so the game ends."
      : "The game goes on for the other players.";
  return `${who} resigns. Their properties go to the player they owe, or to the bank for auction. ${rest}`;
}
