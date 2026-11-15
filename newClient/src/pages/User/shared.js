export { ksh, m3, formatDate, formatDateTime, balanceLabel, displayPhone, downloadCsv, paymentMethodLabel } from "../../lib/format"

export const toMillisSafe = (iso) => (iso ? Date.parse(iso) : 0)
