#!/usr/bin/env bash
# 反作弊扫描：扫出"假通过"手法，命中任意一条即非零退出。
# 用法：bash scripts/anti-cheat-check.sh
# 输出：docs/night/anti-cheat-report.md
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

OUT="docs/night/anti-cheat-report.md"
mkdir -p docs/night
VIOL=0
TESTS=$(git ls-files | grep -E '\.(test|spec)\.(ts|tsx)$' || true)

{
  echo "# 反作弊扫描报告"
  echo
  echo "扫描时间：$(date '+%F %T')"
  echo
} > "$OUT"

hit () {
  VIOL=$((VIOL+1))
  {
    echo "## [命中 $VIOL] $1"
    echo '```'
    echo "$2"
    echo '```'
    echo
  } >> "$OUT"
}

if [ -n "$TESTS" ]; then
  # 规则 2：only / fit —— 一律违规
  H=$(echo "$TESTS" | xargs grep -nE '\.only\(|\bfit\(|\bfdescribe\(' 2>/dev/null || true)
  [ -n "$H" ] && hit "only/fit 独占测试（一律违规）" "$H"

  # 规则 1：skip —— 只有走了 blocked 流程才放行
  H=$(echo "$TESTS" | xargs grep -nE '\.skip\(|\bxit\(|\bxdescribe\(' 2>/dev/null || true)
  if [ -n "$H" ]; then
    while IFS= read -r line; do
      F=$(echo "$line" | cut -d: -f1)
      LASTMSG=$(git log -1 --format=%s -- "$F" 2>/dev/null || echo "")
      OK=1
      case "$LASTMSG" in *blocked*) ;; *) OK=0 ;; esac
      grep -q "$(basename "$F")" docs/night/blockers.md 2>/dev/null || OK=0
      [ "$OK" -eq 0 ] && hit "未走 blocked 流程的 skip" "$line
最近 commit: $LASTMSG"
    done <<EOF
$H
EOF
  fi

  # 规则 3：恒真断言
  H=$(echo "$TESTS" | xargs grep -nE 'expect\(true\)\.toBe\(true\)|expect\(1\)\.toBe\(1\)|expect\(false\)\.toBe\(false\)' 2>/dev/null || true)
  [ -n "$H" ] && hit "恒真/占位断言" "$H"

  # 规则 4：弱断言占比过高
  for f in $TESTS; do
    # 用 grep -o 按"出现次数"统计而不是按行数（一行里可能有多个 expect）
    T=$(grep -o 'expect(' "$f" 2>/dev/null | wc -l | tr -d ' '); T=${T:-0}
    W=$(grep -oE 'toBeDefined\(\)|toBeTruthy\(\)' "$f" 2>/dev/null | wc -l | tr -d ' '); W=${W:-0}
    if [ "$T" -gt 2 ] && [ $((W * 100 / T)) -ge 60 ]; then
      hit "弱断言占比过高（>=60%）" "$f: $W/$T"
    fi
  done

  # 规则 5：try/catch 吞掉断言失败
  H=$(echo "$TESTS" | xargs perl -0777 -ne '
    while (/try\s*\{(.*?)\}\s*catch\s*\([^)]*\)\s*\{(.*?)\}/sg) {
      my ($t,$c)=($1,$2);
      print "$ARGV\n" if $t=~/expect\(/ && $c!~/throw|fail\(/;
    }' 2>/dev/null || true)
  [ -n "$H" ] && hit "try/catch 吞掉断言失败" "$H"

  # 规则 6：mock 掉被测模块本身
  for f in $TESTS; do
    S=$(basename "$f" | sed -E 's/\.(test|spec)\.(ts|tsx)$//')
    H=$(grep -nE "vi\.mock\(['\"][^'\"]*${S}['\"]" "$f" 2>/dev/null || true)
    [ -n "$H" ] && hit "疑似 mock 掉被测模块本身（$f）" "$H"
  done

  # 规则 8：被注释掉的测试
  H=$(echo "$TESTS" | xargs grep -nE '^[[:space:]]*//[[:space:]]*(it|test|describe)\(' 2>/dev/null || true)
  [ -n "$H" ] && hit "被注释掉的测试用例" "$H"

  # 规则 11：用 env 条件跳过
  H=$(echo "$TESTS" | xargs grep -nE 'if[[:space:]]*\(.*process\.env.*\)[[:space:]]*(return|continue)' 2>/dev/null || true)
  [ -n "$H" ] && hit "用 process.env 条件跳过测试逻辑" "$H"

  # 规则 12：rejects 弱断言
  H=$(echo "$TESTS" | xargs grep -nE '\.rejects\.(toBeDefined|toBeTruthy)\(\)' 2>/dev/null || true)
  [ -n "$H" ] && hit "rejects 未断言具体错误" "$H"
fi

# 规则 7：E2E 只截图不断言
for f in $(git ls-files 'tests/e2e' 2>/dev/null || true); do
  if grep -q 'screenshot(' "$f" 2>/dev/null && ! grep -q 'expect(' "$f" 2>/dev/null; then
    hit "E2E 只截图无断言" "$f"
  fi
done

# 规则 13：集成测试里 mock Supabase
H=$(git ls-files 'tests/integration' 2>/dev/null | xargs grep -nE 'vi\.mock\(.*supabase' 2>/dev/null || true)
[ -n "$H" ] && hit "集成测试里 mock 了 Supabase" "$H"

# 规则 9：覆盖率阈值被下调
if [ -f scripts/coverage-baseline.json ] && [ -f vitest.config.ts ]; then
  BAD=$(node -e '
    const fs=require("fs");
    const b=JSON.parse(fs.readFileSync("scripts/coverage-baseline.json","utf8"));
    const c=fs.readFileSync("vitest.config.ts","utf8");
    const out=[];
    for (const m of c.matchAll(/(lines|branches|functions|statements)\s*:\s*(\d+)/g)) {
      if (b[m[1]]!==undefined && Number(m[2]) < b[m[1]]) out.push(m[1]+": "+m[2]+" < 基线 "+b[m[1]]);
    }
    if (out.length) console.log(out.join("\n"));
  ' 2>/dev/null || true)
  [ -n "$BAD" ] && hit "覆盖率阈值被下调" "$BAD"
fi

# 规则 10：测试文件被删除
ROOT=$(git rev-list --max-parents=0 HEAD 2>/dev/null | tail -1)
if [ -n "$ROOT" ]; then
  DEL=$(git diff --diff-filter=D --name-only "$ROOT"..HEAD 2>/dev/null | grep -E '\.(test|spec)\.(ts|tsx)$' || true)
  [ -n "$DEL" ] && hit "测试文件被删除" "$DEL"
fi

# 规则 15：构建产物泄漏服务端密钥（安全，不是作弊但同等严重）
if [ -d .next/static ]; then
  H=$(grep -rl 'service_role\|SERVICE_ROLE\|sb_secret_' .next/static 2>/dev/null || true)
  [ -n "$H" ] && hit "🚨 构建产物中疑似泄漏服务端密钥" "$H"
fi

{
  echo "---"
  echo
  echo "**总命中：$VIOL**"
} >> "$OUT"

echo "反作弊扫描完成，命中 $VIOL 条，详见 $OUT"
[ "$VIOL" -gt 0 ] && exit 1
exit 0
