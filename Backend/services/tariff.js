// ⚠ PLACEHOLDER RATES. Replace with your utility's approved (WASREB) tariff
// before issuing real bills. Amounts in Ksh; consumption blocks in m³/month.
export const TARIFF = {
  name: "Domestic (placeholder rates)",
  standingCharge: 100, // per meter per month, charged even at zero usage
  blocks: [
    { upToM3: 6, ratePerM3: 60 },
    { upToM3: 60, ratePerM3: 80 },
    { upToM3: null, ratePerM3: 100 }, // null = no upper limit
  ],
};

const round2 = (n) => Math.round(n * 100) / 100;

// Tiered (block) pricing: each block's rate applies only to the m³ within it.
// Returns line items and a total rounded to whole shillings (M-Pesa only
// accepts whole amounts).
export function computeCharges(consumptionLitres, tariff = TARIFF) {
  const m3 = consumptionLitres / 1000;
  const lines = [];
  let lower = 0;

  for (const { upToM3, ratePerM3 } of tariff.blocks) {
    const upper = upToM3 ?? Infinity;
    const quantity = Math.max(0, Math.min(m3, upper) - lower);
    if (quantity > 0) {
      lines.push({
        label: upper === Infinity ? `Over ${lower} m³` : `${lower}–${upper} m³`,
        quantityM3: Math.round(quantity * 1000) / 1000,
        ratePerM3,
        amount: round2(quantity * ratePerM3),
      });
    }
    if (m3 <= upper) break;
    lower = upper;
  }

  lines.push({ label: "Standing charge", quantityM3: null, ratePerM3: null, amount: tariff.standingCharge });

  return { tariff: tariff.name, lines, total: Math.round(lines.reduce((s, l) => s + l.amount, 0)) };
}
