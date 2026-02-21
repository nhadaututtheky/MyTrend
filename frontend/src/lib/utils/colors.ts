// Project color palette for consistent color assignment
const PROJECT_COLORS = [
  '#00D26A', // green
  '#4ECDC4', // blue
  '#FF9F43', // orange
  '#A29BFE', // purple
  '#FF4757', // red
  '#FFE66D', // yellow
  '#6C5CE7', // deep purple
  '#FDA7DF', // pink
  '#55E6C1', // mint
  '#F8A5C2', // rose
] as const;

export function getProjectColor(index: number): string {
  return PROJECT_COLORS[index % PROJECT_COLORS.length] ?? PROJECT_COLORS[0];
}

export function getHeatmapColor(level: 0 | 1 | 2 | 3 | 4, isDark: boolean): string {
  if (isDark) {
    const colors = ['#161B22', '#0E4429', '#006D32', '#26A641', '#39D353'] as const;
    return colors[level];
  }
  const colors = ['#EBEDF0', '#9BE9A8', '#40C463', '#30A14E', '#216E39'] as const;
  return colors[level];
}

export function getActivityTypeColor(type: string): string {
  const colorMap: Record<string, string> = {
    conversation: '#4ECDC4',
    coding: '#00D26A',
    idea: '#FFE66D',
    search: '#A29BFE',
    review: '#FF9F43',
    commit: '#6C5CE7',
    pr: '#FDA7DF',
    issue: '#FF4757',
  };
  return colorMap[type] ?? '#888888';
}
