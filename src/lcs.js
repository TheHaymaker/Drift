/**
 * Longest Common Subsequence — shared between build-frames.js and the git worker.
 * Returns an array of items common to both sequences, preserving order.
 */
export function lcs(a, b) {
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const res = [];
  let i = m,
    j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      res.unshift({ ai: i - 1, bi: j - 1, v: a[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) i--;
    else j--;
  }
  return res;
}
