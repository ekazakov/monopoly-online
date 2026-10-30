# Harborfront: game rules reference

| | |
|---|---|
| Companion docs | [game-screen-2-gameplay.md](game-screen-2-gameplay.md) (turn flow, states, questions and decisions) and [game-screen-2-spec.md](game-screen-2-spec.md) (UI) |
| Status | Draft. Last updated 2026-10-30 |

This is the rule set the game implements. It is written in our own words for a property-trading game on a 40-square loop. Rules that came from a question are marked **[Q8]**, **[Q9]** and so on, which point to the questions in section 6 of the gameplay doc.

**Terms.** Community Chest is **Chest**, a railroad is a **Station**, a title deed is a **Deed**. GO is **Start**. Chance, Jail and Free Parking keep their names (decided, Q18).

**Key numbers**

| Item | Value |
|---|---|
| Starting cash | $1,500 per player |
| Start salary | $200 |
| Jail fine | $50 |
| Income Tax / Luxury Tax | $200 / $100 (flat) |
| Mortgage value | Half the price |
| Lifting a mortgage | Mortgage value + 10% |
| Selling a building back | Half its build price |
| Building supply | Unlimited |

---

## 1. Setup and turn order

1. Every player starts with their token on Start and $1,500.
2. Before the game starts, the server puts the players in a random turn order. The first player in that order plays first.
3. Play then follows that order (clockwise on the rail, top to bottom). Tokens stay where they are between turns. Any number of tokens may share a square.

---

## 2. A turn

1. **Pending debts first.** If the player owes anything from earlier (section 12), it is settled before anything else.
2. **Before the roll.** The player may manage properties and propose trades (section 9).
3. **Roll** two dice and move that many squares clockwise.
4. **Resolve the square** the token landed on (section 3).
5. **Doubles.** If both dice show the same number, the player resolves the landing and then rolls again (steps 3 to 5 repeat). On the **third** double in a row the token goes straight to Jail without resolving the roll (section 6).
6. **After the landing.** The player may manage properties and propose trades again, then ends the turn.

Being sent to Jail ends the turn at once, even on a double.

---

## 3. What each square does

| Square | Effect |
|---|---|
| Start | Collect the salary when landing on or passing it, once per lap. The salary is also paid when a card moves the token past or onto Start (unless the card says otherwise), so a player can collect twice in one turn |
| Property, unowned | Buy at the printed price, or the property goes to auction (section 11) |
| Property, owned by another player | Pay rent (section 4). No rent if it is mortgaged |
| Property, owned by the player | Nothing |
| Chance / Chest | Draw the top card and do what it says (section 5) |
| Income Tax / Luxury Tax | Pay the flat amount to the bank |
| Jail (just visiting) | Nothing |
| Free Parking | Nothing. A resting place with no reward |
| Go to Jail | Move directly to Jail (section 6) |

The token never earns the Start salary when it is sent to Jail or moved backwards.

---

## 4. Rent

Rent is collected automatically. The owner does not need to ask for it (decided, **[Q9]**). The owner can be in Jail and still collects.

- **Streets.** The rent depends on the buildings on the street (table in Appendix B). A street with no buildings pays **double** its base rent when the owner holds every street of its colour group, even if one of those streets is mortgaged.
- **Stations.** $25, $50, $100 or $200 for owning one, two, three or four stations.
- **Utilities.** 4 × the dice total if the owner has one utility, 10 × if they have both. The dice total is the roll that brought the token there. When a card sends the token there, the player rolls once for the amount and the multiplier is 10.
- **Mortgaged properties** collect nothing. Other properties in the same group still do.

---

## 5. Chance and Chest

Draw the top card, follow it, then put it at the bottom of its deck. A **Get Out of Jail Free** card is kept by the player instead and returns to the bottom of its deck when it is used. Cards are in Appendix C. A card that moves the token resolves the new square as a normal landing. A card that sends the token backwards does not pay Start. "Nearest" means the next one ahead, and passing Start on the way pays the salary.

---

## 6. Jail

**Going to Jail.** Land on Go to Jail, draw a jail card, or roll three doubles in a row. The token moves straight to the Jail square, gets the in-jail marker, and the turn ends. No Start salary.

**Staying.** A player in Jail still collects rent, can manage properties and trade.

**Getting out.** On each of the next three turns the player may, before rolling:
- pay $50, or
- use a Get Out of Jail Free card.

Either way they then roll and move normally. Doubles on that roll give another roll, as on any turn (decided, **[Q10]**).

Otherwise the player rolls for doubles. If it is a double they leave Jail, move the rolled number, and do **not** get another roll. If not, they stay in Jail and the turn ends. After the third failed attempt the $50 fine is mandatory, the player leaves Jail and moves the number just rolled. If they can't afford the fine, section 12 applies: the debt is settled first, then the player leaves Jail and moves the number just rolled. The player can't stay in Jail (decided, **[Q11]**).

---

## 7. Buildings

- A player may build only on a colour group they fully own, with none of its streets mortgaged.
- Build **evenly**: the buildings on streets of a group may never differ by more than one level.
- A street holds up to four houses, then one hotel. A hotel needs four houses on every street in the group, and replaces the four houses on the street it goes on.
- The build price is on the Deed (Appendix B) and is the same for houses and hotels in a group.
- Selling goes back to the bank at half the build price, evenly and in reverse. A hotel sells down to four houses.
- There is no limit on how many houses and hotels exist.

---

## 8. Mortgages

- A street can be mortgaged only with no buildings on any street of its group. Sell the buildings first.
- The owner receives the mortgage value (half the price) and keeps the property. A mortgaged property collects no rent.
- To lift the mortgage, pay the mortgage value plus 10%, rounded up to whole dollars. A group can be built on again only when none of its streets is mortgaged.
- A mortgaged property may be traded. It stays mortgaged, and the new owner pays no interest on the transfer. They pay the mortgage value plus 10% when they lift it (decided, **[Q8]**).

---

## 9. Buying, selling and trading

- Properties can be traded between players for any agreed price in cash, properties or Get Out of Jail Free cards. A property cannot be traded while any street of its colour group has buildings.
- Both players must agree.
- Trades can be proposed only in the windows in section 10.

---

## 10. Windows for acting out of turn

To keep a networked game ordered, a player can build, sell buildings, mortgage, lift a mortgage and propose trades only:
- on their own turn, before the roll and after the landing is resolved, and
- while settling a debt (section 12).

Auction bids happen in the auction's own turn order (section 11).

---

## 11. Auctions

An auction starts when a player declines to buy an unowned property or cannot afford it, and when the bank sells off the assets of a bankrupt player.

- **Who bids.** Every active player, including the one who declined.
- **Order.** Seat order, starting with the player who landed on the square.
- **Opening bid.** At least $10.
- **Raising.** A bidder raises by +$10, +$50 or +$100 over the current bid.
- **Limit.** No bid above the bidder's cash.
- **Passing.** A pass is final: the player cannot return to the auction.
- **End.** The auction ends when every bidder but the highest has passed. The winner pays the bank and gets the Deed.
- **No bids.** The property stays unowned. The next player who lands on it can buy it or start an auction (decided, **[Q12]**).
- **Several properties.** A bankrupt player's properties are auctioned one at a time in board order.

---

## 12. Debt and bankruptcy

**Paying.** If the player has the cash, the payment is made at once.

**When the cash isn't there.** The game computes the player's **liquidation value**:
- all their cash,
- plus the mortgage value of every unmortgaged property,
- plus half the build price of every house and hotel they own.

Properties that are already mortgaged add nothing. Trades are not counted.

- If the liquidation value is **less** than the debt, the player is declared **bankrupt** at once.
- Otherwise they are in **debt** and must raise the money themselves: they choose which buildings to sell and which properties to mortgage, in any order. They can't end the turn, buy, or build until the debt is paid.
- A debt that arises **on the player's own turn** (rent, tax, a card, the jail fine) is settled during that turn.
- A debt that arises **on another player's turn** (a card that collects from every player) becomes a **pending debt** and falls due at the start of the debtor's next turn, before they roll. The bankruptcy check runs once when it arises and again when it falls due.
- Several debts are paid in the order they arose. If the assets can't cover all of them, the player is bankrupt.

**What bankruptcy does.**
- Debt to a **player**: the player's buildings are sold to the bank at half price, and the player gives the creditor all their cash (including that money) and their properties. Mortgaged properties stay mortgaged (decided, **[Q8]**). A debt to several players: the cash is split in proportion to the amounts owed, each share rounded down, and the remainder goes to the creditor owed the most. The deeds go to that same creditor. On a tie, the creditor who plays first after the debtor wins (decided, **[Q13]**).
- Debt to the **bank**: everything goes to the bank. Buildings are removed, and the properties are auctioned one at a time (section 11).
- Get Out of Jail Free cards held by the bankrupt player always return to the bottom of their decks, also on a debt to a player (decided, **[Q14]**).
- A pending debt whose creditor is eliminated before it falls due is cancelled (decided, **[Q17]**).
- The bankrupt player is **eliminated**. They stay in the game as a **spectator** who can watch the board and log but not act.

**Resigning.** A player may resign at any time, also off turn, but not while an auction runs. Resigning is a bankruptcy: to the creditor if the player owes a debt to a player, otherwise to the bank. An open trade offer is cancelled. Debts that other players owe to the player who resigns are cancelled. If the player on turn was raising cash for such a debt and has no other debt, their turn goes on as if they had paid. On a device with several hot-seat players, one chosen player resigns (decided, **[Q16]**).

---

## 13. End of game

The game ends when only one active player is left. That player wins. There is no time or round limit (decided, **[Q15]**).

The session owner can also finish the game early. Then there is no winner (gameplay doc section 3.1).

---

# Appendix A: board layout

40 squares, numbered from Start and running clockwise (along the bottom towards the left, then up the left side, along the top, and down the right side).

| Side | Squares |
|---|---|
| Bottom | 0 Start · 1 Driftwood Lane · 2 Chest · 3 Kelp Court · 4 Income Tax · 5 North Station · 6 Lantern Row · 7 Chance · 8 Cobble Street · 9 Saltmarsh Road |
| Left | 10 Jail (just visiting) · 11 Anchor Street · 12 Power Works · 13 Rope Walk · 14 Chandlers Quay · 15 East Station · 16 Net Loft Road · 17 Chest · 18 Fishmarket Square · 19 Customs House Row |
| Top | 20 Free Parking · 21 Beacon Hill · 22 Chance · 23 Lighthouse Road · 24 Signal Point · 25 South Station · 26 Boatyard Way · 27 Shipwright Street · 28 Pump House · 29 Dry Dock Avenue |
| Right | 30 Go to Jail · 31 Admiralty Gardens · 32 Merchant Terrace · 33 Chest · 34 Mariners Crescent · 35 West Station · 36 Chance · 37 Harbour Heights · 38 Luxury Tax · 39 Grand Pier |

Square numbers match the layout in the design spec section 4.4.

# Appendix B: property data

**Streets.** Base rent is paid with no buildings (doubled for a complete group with no buildings). All prices in dollars.

| Sq | Name | Group | Price | Rent | 1 house | 2 houses | 3 houses | 4 houses | Hotel | Build price | Mortgage |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Driftwood Lane | Brown | 60 | 2 | 10 | 30 | 90 | 160 | 250 | 50 | 30 |
| 3 | Kelp Court | Brown | 60 | 4 | 20 | 60 | 180 | 320 | 450 | 50 | 30 |
| 6 | Lantern Row | Sky | 100 | 6 | 30 | 90 | 270 | 400 | 550 | 50 | 50 |
| 8 | Cobble Street | Sky | 100 | 6 | 30 | 90 | 270 | 400 | 550 | 50 | 50 |
| 9 | Saltmarsh Road | Sky | 120 | 8 | 40 | 100 | 300 | 450 | 600 | 50 | 60 |
| 11 | Anchor Street | Pink | 140 | 10 | 50 | 150 | 450 | 625 | 750 | 100 | 70 |
| 13 | Rope Walk | Pink | 140 | 10 | 50 | 150 | 450 | 625 | 750 | 100 | 70 |
| 14 | Chandlers Quay | Pink | 160 | 12 | 60 | 180 | 500 | 700 | 900 | 100 | 80 |
| 16 | Net Loft Road | Orange | 180 | 14 | 70 | 200 | 550 | 750 | 950 | 100 | 90 |
| 18 | Fishmarket Square | Orange | 180 | 14 | 70 | 200 | 550 | 750 | 950 | 100 | 90 |
| 19 | Customs House Row | Orange | 200 | 16 | 80 | 220 | 600 | 800 | 1,000 | 100 | 100 |
| 21 | Beacon Hill | Red | 220 | 18 | 90 | 250 | 700 | 875 | 1,050 | 150 | 110 |
| 23 | Lighthouse Road | Red | 220 | 18 | 90 | 250 | 700 | 875 | 1,050 | 150 | 110 |
| 24 | Signal Point | Red | 240 | 20 | 100 | 300 | 750 | 925 | 1,100 | 150 | 120 |
| 26 | Boatyard Way | Yellow | 260 | 22 | 110 | 330 | 800 | 975 | 1,150 | 150 | 130 |
| 27 | Shipwright Street | Yellow | 260 | 22 | 110 | 330 | 800 | 975 | 1,150 | 150 | 130 |
| 29 | Dry Dock Avenue | Yellow | 280 | 24 | 120 | 360 | 850 | 1,025 | 1,200 | 150 | 140 |
| 31 | Admiralty Gardens | Green | 300 | 26 | 130 | 390 | 900 | 1,100 | 1,275 | 200 | 150 |
| 32 | Merchant Terrace | Green | 300 | 26 | 130 | 390 | 900 | 1,100 | 1,275 | 200 | 150 |
| 34 | Mariners Crescent | Green | 320 | 28 | 150 | 450 | 1,000 | 1,200 | 1,400 | 200 | 160 |
| 37 | Harbour Heights | Navy | 350 | 35 | 175 | 500 | 1,100 | 1,300 | 1,500 | 200 | 175 |
| 39 | Grand Pier | Navy | 400 | 50 | 200 | 600 | 1,400 | 1,700 | 2,000 | 200 | 200 |

**Stations.** Price $200, mortgage $100. Rent $25 / $50 / $100 / $200 for 1 / 2 / 3 / 4 owned.

| Sq | Name |
|---|---|
| 5 | North Station |
| 15 | East Station |
| 25 | South Station |
| 35 | West Station |

**Utilities.** Price $150, mortgage $75. Rent 4 × the dice with one owned, 10 × with both.

| Sq | Name |
|---|---|
| 12 | Power Works |
| 28 | Pump House |

The prices of Driftwood Lane, Kelp Court, Lantern Row, Cobble Street, Saltmarsh Road, Beacon Hill, the Stations and Power Works match the sample hand in the design spec (4.6).

# Appendix C: Chance and Chest decks

16 cards each. Card text below is original wording. Square numbers refer to Appendix A.

## Chance

| # | Card | Effect |
|---|---|---|
| 1 | Sail home | Advance to Start. Collect $200 |
| 2 | Climb the hill | Advance to Beacon Hill (21). Collect $200 if you pass Start |
| 3 | Pier inspection | Advance to Grand Pier (39) |
| 4 | Anchor day | Advance to Anchor Street (11). Collect $200 if you pass Start |
| 5 | Next stop, a Station | Advance to the nearest Station. If unowned, you may buy it. If owned, pay the owner double the normal rent |
| 6 | Next stop, a Station | Same as card 5 |
| 7 | Nearest utility | Advance to the nearest Utility. If unowned, you may buy it. If owned, roll the dice and pay the owner 10 × the total |
| 8 | Trip to East Station | Advance to East Station (15). Collect $200 if you pass Start |
| 9 | Dividend | The bank pays you $50 |
| 10 | Loan matures | Collect $150 |
| 11 | Back three | Move back three squares |
| 12 | Marina fine | Pay the bank $15 |
| 13 | Dock repairs | Pay $25 per house and $100 per hotel you own |
| 14 | Harbour master's party | Pay each other player $50 |
| 15 | Go to Jail | Go directly to Jail. Do not pass Start, do not collect $200 |
| 16 | Get Out of Jail Free | Keep until needed, or sell. Returns to the bottom of the deck when used |

## Chest

| # | Card | Effect |
|---|---|---|
| 1 | Home port | Advance to Start. Collect $200 |
| 2 | Bank error | Collect $200 |
| 3 | Doctor's bill | Pay $50 |
| 4 | Cargo sale | Collect $50 |
| 5 | Fund matures | Collect $100 |
| 6 | Tax refund | Collect $20 |
| 7 | Festival | Collect $10 from every other player |
| 8 | Insurance matures | Collect $100 |
| 9 | Hospital fees | Pay $100 |
| 10 | School fees | Pay $50 |
| 11 | Consulting fee | Collect $25 |
| 12 | Street repairs | Pay $40 per house and $115 per hotel you own |
| 13 | Regatta prize | Collect $10 |
| 14 | Inheritance | Collect $100 |
| 15 | Go to Jail | Go directly to Jail. Do not pass Start, do not collect $200 |
| 16 | Get Out of Jail Free | Keep until needed, or sell. Returns to the bottom of the deck when used |

The repair cards charge the bank. If the player has no buildings they pay nothing.
