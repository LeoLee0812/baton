#!/usr/bin/env bash
# 从 docs/night/progress.log 生成 AC 完成矩阵。
# ⛔ 矩阵必须由这个脚本生成，不许凭记忆手写。
# progress.log 行格式：
#   ISO时间 | AC-x.y.z | RED|GREEN|PARTIAL|BLOCKED|SKIPPED | commit短哈希 | 备注
# 用法：bash scripts/make-ac-matrix.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

SRC=docs/night/progress.log
OUT=docs/night/ac-matrix.md

if [ ! -s "$SRC" ]; then
  echo "progress.log 为空或不存在，无法生成矩阵" >&2
  exit 1
fi

{
  echo "# AC 完成矩阵"
  echo
  echo "生成时间：$(date '+%F %T')　｜　数据源：docs/night/progress.log"
  echo
  echo "| AC | 最终状态 | 时间 | commit | 备注 |"
  echo "|---|---|---|---|---|"
} > "$OUT"

# 每条 AC 取最后一次记录作为最终状态
awk -F'|' '
function trim(x) { gsub(/^[ \t]+|[ \t]+$/, "", x); return x }
{
  ac = trim($2)
  if (ac == "") next
  t[ac] = trim($1); s[ac] = trim($3); c[ac] = trim($4); n[ac] = trim($5)
}
END {
  for (ac in s) printf "| %s | %s | %s | %s | %s |\n", ac, s[ac], t[ac], c[ac], n[ac]
}' "$SRC" | sort >> "$OUT"

# 统计（同样只按每条 AC 的最终状态算）
awk -F'|' '
function trim(x) { gsub(/^[ \t]+|[ \t]+$/, "", x); return x }
{
  ac = trim($2)
  if (ac == "") next
  s[ac] = trim($3)
}
END {
  total = 0
  for (ac in s) { cnt[s[ac]]++; total++ }
  print ""
  print "## 统计"
  print ""
  split("GREEN PARTIAL BLOCKED SKIPPED RED", order, " ")
  for (i = 1; i <= 5; i++) {
    st = order[i]
    printf "- %s：%d\n", st, (st in cnt ? cnt[st] : 0)
  }
  printf "- 合计有记录的 AC：%d\n", total
}' "$SRC" >> "$OUT"

echo "已生成 $OUT"
cat "$OUT"
