// utils/checkinChecker.js

/**
 * 最終チェックイン日時から指定時間以上経過しているかチェックする
 * @param {Date|string} lastCheckinAt - 最終チェックイン日時
 * @param {number} thresholdHours - 判定の閾値（時間単位、デフォルト24時間）
 * @returns {boolean} - 閾値を超えていれば true（アラート対象）
 */
function isOverdue(lastCheckinAt, thresholdHours = 24) {
  if (!lastCheckinAt) return true; // チェックイン記録がない場合は即アラート対象

  const lastCheckinTime = new Date(lastCheckinAt).getTime();
  const currentTime = new Date().getTime();
  const diffInHours = (currentTime - lastCheckinTime) / (1000 * 60 * 60);

  return diffInHours >= thresholdHours;
}

module.exports = { isOverdue };