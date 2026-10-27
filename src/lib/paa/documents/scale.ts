/**
 * Tidy axis bounds and ticks: whole-number steps (1, 2, 2.5, 5 x 10^n) that always include zero, with at most
 * six ticks. Used wherever a chart is drawn by hand (PDF, email images).
 */
export function axisScale(values: number[]): { lo: number; hi: number; ticks: number[] } {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  if (max === min) return { lo: 0, hi: 1, ticks: [0, 1] };

  const steps = [1, 2, 2.5, 5, 10];
  const mag = 10 ** Math.floor(Math.log10((max - min) / 5));
  for (let k = 0; ; k++) {
    const step = steps[k % steps.length] * mag * 10 ** Math.floor(k / steps.length);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const count = Math.round((hi - lo) / step) + 1;
    if (count <= 6) {
      return { lo, hi, ticks: Array.from({ length: count }, (_, i) => Number((lo + i * step).toPrecision(12))) };
    }
  }
}
