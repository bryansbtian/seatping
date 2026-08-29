export const MAX_AXIS_LABELS = 8;

export function axisLabelStep(count: number, maxLabels = MAX_AXIS_LABELS): number {
  if (count <= maxLabels) {
    return 1;
  }
  return Math.ceil(count / maxLabels);
}
