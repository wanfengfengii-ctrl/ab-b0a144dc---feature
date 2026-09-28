#!/bin/sh
# 一次性验证服务：依次报告单元测试、生产构建、复原核心样例冒烟、健康端点冒烟，
# 并以退出码汇报总体结论（0=全部通过，1=存在失败）。
set -u

fail=0

step() {
  name="$1"
  shift
  echo ""
  echo "==================== ${name} ===================="
  if "$@"; then
    echo "[PASS] ${name}"
  else
    echo "[FAIL] ${name}"
    fail=1
  fi
}

step "单元测试 (vitest run)" npm run test
step "生产构建 (tsc --noEmit && vite build)" npm run build
step "复原核心样例冒烟" npm run smoke:core
step "健康端点冒烟 (${HEALTH_URL:-http://web/health})" node scripts/healthcheck.mjs

echo ""
echo "=================================================="
if [ "$fail" -eq 0 ]; then
  echo "VERIFY RESULT: PASS（单元测试 / 生产构建 / 冒烟全部通过）"
else
  echo "VERIFY RESULT: FAIL（存在未通过的步骤）"
fi
exit "$fail"
