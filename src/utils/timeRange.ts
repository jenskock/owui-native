/**
 * Time range label for grouping (matches open-webui getTimeRange).
 * @param timestamp Unix timestamp in seconds
 */
export function getTimeRange(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp * 1000);
  const diffTime = now.getTime() - date.getTime();
  const diffDays = diffTime / (1000 * 3600 * 24);
  const nowDate = now.getDate();
  const nowMonth = now.getMonth();
  const nowYear = now.getFullYear();
  const dateDate = date.getDate();
  const dateMonth = date.getMonth();
  const dateYear = date.getFullYear();

  if (nowYear === dateYear && nowMonth === dateMonth && nowDate === dateDate) {
    return 'Today';
  }
  if (nowYear === dateYear && nowMonth === dateMonth && nowDate - dateDate === 1) {
    return 'Yesterday';
  }
  if (diffDays <= 7) return 'Previous 7 days';
  if (diffDays <= 30) return 'Previous 30 days';
  if (nowYear === dateYear) {
    return date.toLocaleString('default', { month: 'long' });
  }
  return date.getFullYear().toString();
}
