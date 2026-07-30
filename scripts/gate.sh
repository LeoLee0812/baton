#!/usr/bin/env bash
# 阶段闸门：全绿才允许进入下一阶段。
# 用法：bash scripts/gate.sh P2
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

PHASE="${1:-unknown}"
FAIL=0
LOG=/tmp/bt_gate.log

run () {
  printf '▶ %s\n' "$1"
  if eval "$2" > "$LOG" 2>&1; then
    printf '  [PASS] %s\n' "$1"
  else
    printf '  [FAIL] %s\n' "$1"
    tail -30 "$LOG"
    FAIL=1
  fi
}

run "类型检查"   "npm run typecheck"
run "单元测试"   "npx vitest run --project unit --passWithNoTests"
run "组件测试"   "npx vitest run --project component --passWithNoTests"
run "集成测试"   "npx vitest run --project integration --passWithNoTests"
run "反作弊扫描" "bash scripts/anti-cheat-check.sh"
run "生产构建"   "npm run build"

# 构建产物密钥泄漏检查（构建之后才有意义）
if [ -d .next/static ]; then
  if grep -rq 'service_role\|SERVICE_ROLE\|sb_secret_' .next/static 2>/dev/null; then
    printf '  [FAIL] 🚨 构建产物中发现服务端密钥\n'
    FAIL=1
  else
    printf '  [PASS] 构建产物无密钥泄漏\n'
  fi
fi

printf '===== 闸门 %s：%s =====\n' "$PHASE" "$([ $FAIL -eq 0 ] && echo 通过 || echo 未通过)"
exit $FAIL
