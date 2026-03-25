/**
 * Returns this week's Sunday as a YYYY-MM-DD string.
 * JavaScript's getDay() returns 0 for Sunday, so we subtract
 * the current day index to roll back to Sunday.
 */

export function getThisSunday() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - dayOfWeek);

  const year = sunday.getFullYear();
  const month = String(sunday.getMonth() + 1).padStart(2, "0");
  const day = String(sunday.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
