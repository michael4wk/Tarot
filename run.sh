#!/usr/bin/env bash
# 一键启动脚本（macOS）
# 功能：
# 1) 自动定位项目根目录并切换到该目录
# 2) 可选：自动启用 .nvmrc 指定的 Node 版本（若本机安装了 nvm）
# 3) 如首次运行，自动安装依赖（优先使用 npm ci，保证锁定版本一致）
# 4) 启动本地开发服务器（Vite），默认端口 5173，可通过参数/环境变量覆盖
# 5) 若端口被占用，自动向上探测可用端口（最多尝试 20 个）
# 6) 支持 OPEN=1 环境变量自动打开浏览器
# 7) 运行前环境自检：提示 GEMINI_MODEL/VITE_GEMINI_MODEL 未设置的情况（非注入、仅提示）
#
# 使用方式：
#   1) 首次：给予执行权限 ->  chmod +x run.sh
#   2) 默认 5173 端口启动： ./run.sh
#   3) 指定端口启动：       ./run.sh 3000
#   4) 环境变量覆盖：       PORT=5174 OPEN=1 ./run.sh
#
# 说明：
# - Vite 默认端口是 5173；此前你看到 5174 是因为 5173 已被占用，Vite 会自动选择下一个可用端口。
# - 我们将默认端口设为 5173，并通过 --port 参数传给 Vite。

set -euo pipefail

# 进入项目根目录（脚本所在目录）
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$SCRIPT_DIR"

# 彩色输出（若终端支持）
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log_info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# 0) 可选：启用 nvm 并使用 .nvmrc 中版本（若存在）
if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.nvm/nvm.sh" || true
  if command -v nvm >/dev/null 2>&1 && [[ -f .nvmrc ]]; then
    log_info "检测到 nvm 与 .nvmrc，自动切换 Node 版本"
    nvm install >/dev/null
    nvm use >/dev/null
  fi
else
  log_warn "未检测到 nvm（可选）。将使用系统 Node：$(node -v 2>/dev/null || echo '未安装')"
fi

# 0.5) 环境自检（非侵入式）：提示未设置模型的情况
GEM_MODEL_VAL="${GEMINI_MODEL:-}"; VITE_GEM_MODEL_VAL="${VITE_GEMINI_MODEL:-}"
if [[ -z "$GEM_MODEL_VAL" && -z "$VITE_GEM_MODEL_VAL" ]]; then
  log_warn "未检测到 GEMINI_MODEL/VITE_GEMINI_MODEL。将按默认 gemini-2.0-flash 运行（由代码与代理决定）。"
  log_warn "建议在 .env.local 显式添加：VITE_GEMINI_MODEL=gemini-2.0-flash，并重启开发服务器以确保一致性。"
fi

# 1) 打印 Node / npm 版本，便于排查
if command -v node >/dev/null 2>&1; then
  log_info "Node: $(node -v)"
else
  log_error "未安装 Node.js。建议通过 Homebrew 安装：brew install node 或使用 nvm。"; exit 1
fi
if command -v npm >/dev/null 2>&1; then
  log_info "npm:  $(npm -v)"
else
  log_error "未安装 npm。请安装 Node.js（自带 npm）。"; exit 1
fi

# 2) 依赖安装（若 node_modules 不存在）
if [[ ! -d node_modules ]]; then
  log_info "首次运行：检测到缺少依赖，执行 npm ci（锁定安装）"
  npm ci
else
  log_info "依赖已存在，跳过安装。如需强制重新安装，可手动执行：npm ci"
fi

# 3) 解析端口：优先读取命令行参数，其次 PORT 环境变量，最后默认 5173
REQ_PORT="${1:-${PORT:-5173}}"
# 校验端口合法性（1-65535）
if ! [[ "$REQ_PORT" =~ ^[0-9]+$ ]] || ((REQ_PORT < 1 || REQ_PORT > 65535)); then
  log_warn "非法端口: $REQ_PORT，回退为 5173"
  REQ_PORT=5173
fi

# 4) 端口占用检测与自适应选择
is_port_in_use() {
  # macOS 下 lsof 可用；仅检查 LISTEN 状态
  lsof -i :"$1" -sTCP:LISTEN -n -P >/dev/null 2>&1
}

PORT_TO_USE=$REQ_PORT
if is_port_in_use "$PORT_TO_USE"; then
  log_warn "端口 $PORT_TO_USE 已被占用，尝试寻找下一个可用端口"
  FOUND=0
  for ((p=REQ_PORT+1; p<=REQ_PORT+20; p++)); do
    if ! is_port_in_use "$p"; then
      PORT_TO_USE=$p
      FOUND=1
      break
    fi
  done
  if [[ $FOUND -eq 0 ]]; then
    log_warn "在 $REQ_PORT-$((REQ_PORT+20)) 范围内未找到空闲端口，将让 Vite 自行选择（不传 --port）。"
    PORT_TO_USE=""
  fi
fi

# 5) 组装并启动开发服务器
if [[ -n "$PORT_TO_USE" ]]; then
  DEV_CMD=(npm run dev -- --port "$PORT_TO_USE")
else
  DEV_CMD=(npm run dev)
fi

log_info "启动开发服务器：${DEV_CMD[*]}"
"${DEV_CMD[@]}" &
VITE_PID=$!

# 退出时清理子进程（避免僵尸进程）
cleanup() {
  if ps -p "$VITE_PID" >/dev/null 2>&1; then
    log_info "终止开发服务器（PID=$VITE_PID）"
    kill "$VITE_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

# 6) 可选：自动打开浏览器
if [[ "${OPEN:-0}" == "1" ]]; then
  if [[ -n "$PORT_TO_USE" ]]; then
    URL="http://localhost:${PORT_TO_USE}"
    log_info "自动打开浏览器：$URL"
    # macOS 下使用 open
    open "$URL" || true
  else
    log_warn "未能确定端口。Vite 将在控制台输出实际 Local 地址，请手动打开该地址。"
  fi
else
  if [[ -n "$PORT_TO_USE" ]]; then
    log_info "本地预览地址：http://localhost:$PORT_TO_USE/"
  else
    log_info "Vite 会显示实际端口，请在控制台输出中查看 Local 地址。"
  fi
fi

# 7) 前台等待子进程（便于 Ctrl+C 结束）
wait "$VITE_PID"