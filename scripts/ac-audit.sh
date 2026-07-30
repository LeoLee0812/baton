#!/usr/bin/env bash
# AC 交叉核对：把「规格里声明的 AC」「测试标题里出现的 AC」「progress.log 里记过的 AC」三份清单对齐。
#
# 这是给人类用来抓「有 AC 没测试」「有测试没记录」「记录里有规格里不存在的 AC」的工具。
# ⛔ 它只做核对与报告，不改任何文件。
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

OUT=docs/night/ac-audit.md
mkdir -p docs/night

spec_acs=$(grep -rhoE 'AC-[0-9]+\.[0-9]+\.[0-9]+' specs/*/spec.md | sort -u)
test_acs=$(grep -rhoE 'AC-[0-9]+\.[0-9]+\.[0-9]+' tests/ | sort -u)
log_acs=$(awk -F'|' '{gsub(/[ \t]/,"",$2); if ($2 ~ /^AC-/) print $2}' docs/night/progress.log 2>/dev/null | sort -u)

n_spec=$(echo "$spec_acs" | grep -c . || echo 0)
n_test=$(echo "$test_acs" | grep -c . || echo 0)
n_log=$(echo "$log_acs" | grep -c . || echo 0)

no_test=$(comm -23 <(echo "$spec_acs") <(echo "$test_acs"))
no_log=$(comm -23 <(echo "$spec_acs") <(echo "$log_acs"))
ghost=$(comm -13 <(echo "$spec_acs") <(echo "$log_acs"))

{
  echo "# AC 交叉核对报告"
  echo
  echo "生成时间：$(date '+%F %T')"
  echo
  echo "| 来源 | 去重后的 AC 数 |"
  echo "|---|---|"
  echo "| specs/*/spec.md 里声明的 | $n_spec |"
  echo "| tests/ 的测试标题里出现的 | $n_test |"
  echo "| docs/night/progress.log 记过的 | $n_log |"
  echo
  echo "## 有 AC 但**没有任何测试**引用它"
  echo
  if [ -z "$no_test" ]; then echo "（无）"; else echo '```'; echo "$no_test"; echo '```'; fi
  echo
  echo "## 有 AC 但 progress.log 里**没有记录**"
  echo
  if [ -z "$no_log" ]; then echo "（无）"; else echo '```'; echo "$no_log"; echo '```'; fi
  echo
  echo "## progress.log 里出现了**规格里不存在**的 AC（编号写错了）"
  echo
  if [ -z "$ghost" ]; then echo "（无）"; else echo '```'; echo "$ghost"; echo '```'; fi
} > "$OUT"

echo "已生成 $OUT"
echo "规格 $n_spec 条 / 测试覆盖 $n_test 条 / 有记录 $n_log 条"
[ -n "$no_test" ] && echo "⚠️ 有 $(echo "$no_test" | grep -c .) 条 AC 没有测试引用"
[ -n "$ghost" ] && echo "⚠️ progress.log 里有 $(echo "$ghost" | grep -c .) 条编号在规格里找不到"
exit 0
