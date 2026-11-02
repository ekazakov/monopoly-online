export const formatMoney = (amount: number): string =>
  `${amount < 0 ? "−" : ""}$${Math.abs(amount).toLocaleString("en-US")}`;
