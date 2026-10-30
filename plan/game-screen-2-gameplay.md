# Harborfront: Game screen 2, gameplay logic and decisions

|               |                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------- |
| Companion doc | [game-screen-2-spec.md](game-screen-2-spec.md): the UI and visual design of the same screen |
| Canvas        | Harborfront Design System: https://claude.ai/artifact/RtcjA9YX1Sq77osCjy58PK                |
| Artboard      | `project/Wireframe2.dc.html`, titled "Game screen 2"                                        |
| Status        | Draft. Last updated 2026-10-30                                                              |

This document covers the game rules and turn logic that Game screen 2 has to present. How each item looks, its layout, tokens and components, is in the design spec.

---

## 1. Play modes

The game is **mixed multiplayer**:

- Several devices join one game online.
- Each device can seat **one or more players in hot-seat**, passing the device between them.

At any moment the screen is in one of three situations:

| Situation         | Who is on turn                                      | What the device can do                                                       |
| ----------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Local turn**    | A player seated on this device                      | Full controls: roll, buy, build, trade, next turn                            |
| **Local handoff** | The turn moved to another player on the same device | Confirm the handoff, then it becomes a local turn                            |
| **Remote turn**   | A player on another device                          | Watch only: the board, log and dice update live and no actions are available |

---

## 2. Turn flow

A turn moves through these phases. Each phase offers one **primary** action and optional **secondary** actions; the design spec covers how the board centre shows them.

| Phase                  | What happens                                                                                                    | Primary                                                             | Secondary                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| Pending debt           | The player on turn owes a debt that arose on another player's turn. It is settled before anything else          | **Pay** (enabled once cash covers it)                               | Manage (sell buildings / mortgage) |
| Start of turn          | The player on turn may act before rolling                                                                       | **Roll**                                                            | Trade, Manage (build / mortgage)   |
| Rolling                | Two dice are rolled and the sum is the move                                                                     | none                                                                | none                               |
| Moving                 | The token moves that many squares clockwise. Passing Start collects $200                                           | none                                                                | none                               |
| On an unowned property | The player may buy at the listed price                                                                          | **Buy $X**                                                          | Auction                            |
| On an owned property   | Rent is due to the owner, unless the property is mortgaged or the owner is the player on turn                   | **Pay**                                                             | none                               |
| On Chance or Chest     | The top card is drawn and resolved                                                                              | **OK**                                                              | none                               |
| On a tax square        | The tax is due                                                                                                  | **Pay**                                                             | none                               |
| Doubles                | The player rolls again. Three doubles in a row sends them to jail                                               | **Roll again**                                                      | none                               |
| In jail                | The player tries to get out                                                                                     | **Roll for doubles**                                                | Pay $50, Use card                  |
| Turn resolved          | Nothing is due                                                                                                  | **Next turn**                                                       | Trade, Manage                      |
| In debt                | A payment can't be made from cash, but the player's assets could cover it. Next turn, Buy and Build are blocked | **Pay** (enabled once cash covers the debt)                         | Manage (sell buildings / mortgage) |
| Bankrupt               | The player's assets can't cover the debt. This is detected automatically and there is no choice to make         | none: the board centre announces the result, then the turn moves on | none                               |

The wireframe currently shows only **Turn resolved**: the dice read 4 + 3, then Next turn.

### 2.1 Where each rule is written

The rules are in [game-rules-reference.md](game-rules-reference.md). Decisions taken so far:

| Topic               | Rule                           | Decision                                                                                                                                                                         |
| ------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buying and auctions | Rules section 11 | A declined or unaffordable property always goes to auction. Turn-based bidding in seat order, +$10 / +$50 / +$100 raises, a pass is final, bids are capped by cash, no timer. With no bids the property stays unowned |
| Rent | Rules section 4 and Appendix B | Collected automatically, on purpose (the owner does not need to ask). Doubled for a complete unimproved colour set; station and utility rent as in the rules |
| Chance and Chest    | Rules section 5 and Appendix C | 16 original cards per deck                                                                                                                                                       |
| Jail | Rules section 6 | Three attempts, forced $50 fine on the third. If the player can't pay it, the debt is settled first, then they move. After paying or using a card, doubles give another roll |
| Building            | Rules section 7                | Full set and no mortgaged street required, built evenly, no supply limit                                                                                                         |
| Mortgage            | Rules section 8                | Half the price; lifting costs +10%                                                                                                                                               |
| Acting out of turn  | Rules section 10               | Only on your own turn (before the roll and after the landing) and while settling a debt                                                                                          |
| Debt and bankruptcy | Rules section 12 | Automatic bankruptcy when the assets can't cover the debt. Otherwise the player raises the cash themselves. Off-turn debts fall due at the start of the debtor's next turn. Get Out of Jail Free cards of a bankrupt player go back to their decks. A player may resign (a bankruptcy), but not during an auction |
| Taxes               | Rules section 3                | Flat: Income Tax $200, Luxury Tax $100                                                                                                                                           |
| End of game | Rules section 13 | The last active player wins. No time or round limit. Eliminated players keep watching. The session owner can also finish the game early, with no winner (3.1) |

---

## 3. Mixed devices and hot-seat

- **Seating.** Every player belongs to one device. One device can seat several players, and they share its screen in hot-seat.
- **Turn order.** Turn order is the player order and doesn't depend on devices. Consecutive players can be on the same device or on different ones.
- **Handoff.** When the next player is seated on the **same** device, a "Pass to <name>" confirmation is required before their turn's controls unlock. It isn't needed when the next player is on another device.
- **Remote turn.** When a player on another device is on turn, this device mirrors that player's phase without any controls. The board, dice and log update live.
- **Which hand is shown:**
  - on a local turn, the properties of the local player on turn
  - on a remote turn, the hand of the last local player who played, labelled with their name
- **Acting out of turn.** A player who is not on turn can only bid in an auction when it is their turn to bid, and settle a debt that has fallen due. Building, mortgaging and proposing a trade happen on a player's own turn (rules section 10), so a remote turn stays watch-only except for auction bids and answering a trade offer.
- **Trades between devices.** A trade proposed from one device needs confirmation from the other player on their own device. A trade between two hot-seat players on one device needs a "Pass to <name>" handoff before the receiver answers.
- **Connection state.** Each remote player is online, reconnecting or away. See 3.2.
- **Server.** The server runs the game engine and decides all dice rolls and deck shuffles. Devices send actions only. The state sent to devices does not include the random state or the deck order.
- **No bots.** There are no bot players in v1. Only the autopilot (3.2) plays for away players.

### 3.2 Disconnects

| Rule              | Decision                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Unit              | A disconnect applies to a device. All players seated on it become "reconnecting" together                                        |
| Grace time        | 60 seconds. If the device comes back, play continues with no change                                                              |
| Away              | After the grace time the players are "away"                                                                                      |
| Off-turn actions  | An away player passes in an auction when it is their bid, and declines a trade offer                                             |
| Own turn          | An autopilot plays it: roll, do not buy, pay or raise cash for debts, end the turn                                               |
| Return            | An away player can claim their seat again from any device, and play continues for them from the next decision                    |
| Pause             | There is no pause. The owner can use Save and exit (3.1)                                                                         |

### 3.1 Session owner

The **session owner** is the player who created the game. Owner rights never move to another player. The owner keeps them when bankrupt (as a spectator) and when disconnected. An owner who does not come back is a normal disconnect (3.2).

The owner has two controls in the Menu (design spec R-G9). Only the owner's device shows them. Each one needs a confirmation on the owner's device only. Other players do not vote.

**Finish game**

| Rule        | Decision                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| When        | At any moment, also during an auction, a trade offer or a debt                                                    |
| Game state  | The game rolls back to the start of the current turn. An auction, trade offer or debt from this turn is discarded |
| Result      | No winner. The game is cancelled. The final standings show for information only                                   |
| All devices | The board centre shows "Game finished by <owner>" and the standings, with **OK**. Then the device goes to home    |

**Save and exit**

| Rule         | Decision                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| When         | At any moment, also during an auction, a trade offer or a debt                                                                 |
| Saved state  | The state at the start of the current turn. An auction, trade offer or debt from this turn is discarded                        |
| Random state | The save keeps the dice and deck random state. A restored turn gives the same rolls and cards, so a save can't undo a bad roll |
| Slots        | One save per game. A new save replaces the old one                                                                             |
| Expiry       | Never. The save stays until the owner continues or finishes the game                                                           |
| All devices  | The board centre shows "Game saved by <owner>" with **OK**. Then every device goes to home                                     |

**Restore**

- Only the owner restores a game. The owner's saved-games list shows **Continue** and **Finish** for each saved game. Finish from the list ends the game with no winner, as above.
- Seating is free. Each player claims their seat from any device, so hot-seat groups can change.
- Only the original player can claim a seat. A new person can't take the seat of a player who does not come back.
- The game continues when the owner starts it. Players who are not back are away (3.2).

---

## 4. Game states the UI must show

Every state below comes from the rules. The design spec defines how each one looks (requirements R-P6, R-H4, R-H5 and R-L4 there).

| State                        | Applies to      | Set when                                                                               | Cleared when                                                        |
| ---------------------------- | --------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| On turn                      | Player          | Their turn starts                                                                      | They press Next turn                                                |
| In jail                      | Player          | They land on Go to Jail, draw a jail card, or roll three doubles                       | They roll doubles, pay, use a card, or reach the turn limit         |
| Holds a Get Out of Jail card | Player          | They draw one                                                                          | They use or trade it                                                |
| In debt                      | Player          | They owe a payment their cash can't cover but their assets could                       | They pay it                                                         |
| Pending debt                 | Player          | A debt arises on another player's turn, for example a "collect from every player" card | It is settled at the start of their next turn                       |
| Bankrupt (spectator) | Player | The game finds that their assets can't cover a debt (automatic), or they resign | Never. They are out of the game but keep watching the board and log |
| Reconnecting | Player (remote) | Their device loses connection | It reconnects, or 60 seconds pass (then Away) |
| Away | Player (remote) | Their device stays disconnected for 60 seconds (3.2) | They claim their seat again from any device |
| Owned                        | Property        | Bought or won at auction                                                               | Traded, or returned on bankruptcy                                   |
| Set complete                 | Colour group    | One player owns every property in the group                                            | Any property in the group changes owner                             |
| Houses 1–4 / hotel           | Property        | Built during Manage                                                                    | Sold back                                                           |
| Mortgaged                    | Property        | Mortgaged during Manage or Raise cash                                                  | Unmortgaged                                                         |
| Round number                 | Game            | Every player has had one turn                                                          | Never; it only counts up                                            |
| Session owner                | Player          | They create the game                                                                   | Never                                                               |
| Saved                        | Game            | The owner saves the game (3.1)                                                         | The owner continues or finishes it                                  |
| Finished, no winner          | Game            | The owner finishes the game (3.1)                                                      | Never                                                               |

---

## 5. Flows that need rules before design

The design spec lists these as screens (R-G4 to R-G8). **For now none of them is a modal dialog**: they appear in the board centre, or in the expanded hand for Manage properties. This will be reviewed later.

| Flow                       | Logic                                                                                                                                        | Still to define                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Auction | Written: rules section 11 | Nothing blocking |
| Trade | Properties, cash and Get Out of Jail Free cards. No trades of properties in a group with buildings. Proposed on the proposer's own turn only. The receiver answers on their own device, or after a handoff on a shared device (section 3) | Countering |
| Manage properties          | Build, sell, mortgage and unmortgage, following rules sections 7 and 8. Opened from the expanded hand                                        | Nothing blocking                                                                                         |
| Chance / Chest             | Written: rules Appendix C                                                                                                                    | Nothing blocking                                                                                         |
| Bankruptcy and end of game | Written: rules sections 12 and 13, including resigning | Nothing blocking |

---

## 6. Questions and decisions

All questions are closed. The decision for each one is below.

1. [x] Players: 2 to 6 in total, with any number on one device.
2. [x] A disconnected player's turn: a 60-second grace time, then the autopilot plays it (3.2).
3. [x] Trades: a remote receiver confirms on their own device. On a shared device the receiver answers after a "Pass to <name>" handoff.
4. [x] House rules: no Free Parking pot. Jail stays capped at three attempts.
5. [x] No turn timer in v1. The only timer is the 60-second grace time on a disconnect.
6. [x] No bot players in v1. Only the autopilot plays for away players.
7. [x] Opening roll: the server puts the players in a random order.
8. [x] A mortgaged property that changes hands stays mortgaged. No interest is paid on the transfer, only the 10% when the mortgage is lifted (rules section 8).
9. [x] Rent stays automatic, on purpose. The owner does not need to ask for it.
10. [x] After paying the fine or using a card, the player rolls as on any turn. A double gives another roll.
11. [x] On the third jail turn, a player who can't pay the $50 fine settles the debt first (raise cash or bankruptcy), then moves. They can't stay in jail.
12. [x] An auction with no bids: the property stays unowned. The next player who lands there can buy it or start an auction.
13. [x] Several creditors: the cash is split in proportion to the debts. The deeds go to the creditor owed the most (rules section 12).
14. [x] Get Out of Jail Free cards of an eliminated player always go back to the bottom of their decks, also on a debt to a player.
15. [x] No time or round limit in v1. The owner can finish the game early (3.1).
16. [x] A player may resign at any time, but not while an auction runs. It is a bankruptcy: to the creditor if they owe a debt to a player, otherwise to the bank. On a shared device, "Leave game" asks which player resigns. An open trade offer with that player is cancelled.
17. [x] A pending debt whose creditor is eliminated before it falls due is cancelled.
18. [x] GO is renamed **Start**. Chance, Jail and Free Parking keep their names.
19. [x] The server decides dice rolls and deck shuffles. Devices do not get the random state or the deck order.
20. [x] On restore, only the original player can claim a seat. A player who does not come back is away (3.2).
21. [x] The owner saves or finishes during a remote turn: the device of the player on turn shows the same notice as all other devices.
22. [x] A device disconnects: all its players are handled together, with a 60-second grace time, then the away rules (3.2). They can claim their seats again from any device.

---

## 7. Change log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-24 | Decisions recorded: mixed device and hot-seat play, turn actions in the board centre                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-25 | Split out of the design spec into its own document: play modes, turn flow, mixed-device rules, rule-driven states, and gameplay questions                                                                                                                                                                                                                                                                                            |
| 2026-10-25 | Rules review: bankruptcy is automatic from the assets' liquidation value, off-turn debts fall due on the debtor's next turn, bankrupt players become spectators, out-of-turn actions limited to defined windows, auctions turn-based, flat taxes, no building supply limit, no modals for now. Rules rewritten with property data and card decks in [game-rules-reference.md](game-rules-reference.md). Open questions 7 to 19 added |
| 2026-10-29 | Session owner controls (3.1): finish the game with no winner, save and exit, restore by the owner only. Both roll back to the start of the turn and keep the random state. One save slot, no expiry, free re-seating. Open questions 20 to 22 added                                                                                                                                                                                  |
| 2026-10-30 | All open questions decided (section 6). Disconnect rules (3.2), server-side dice and decks, no bots or timers in v1, hot-seat trade handoff, resigning as a bankruptcy, jail cards always back to their decks, 2 to 6 players, GO renamed Start |
