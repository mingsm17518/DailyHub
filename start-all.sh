#!/bin/bash

# DailyHub 一键启动脚本
# 从配置文件加载路径和端口

echo "======================================"
echo "   DailyHub 应用启动脚本"
echo "======================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"

# 默认值
DEFAULT_API_DIR="$SCRIPT_DIR/dailyhub-api"
DEFAULT_WEB_DIR="$SCRIPT_DIR/dailyhub-app"
DEFAULT_API_PORT=3001
DEFAULT_WEB_PORT=3000

# 从配置文件加载
if [ -f "$CONFIG_FILE" ]; then
    API_DIR=$(python3 -c "import json; f=open('$CONFIG_FILE'); c=json.load(f); print(c.get('paths',{}).get('api_dir','$DEFAULT_API_DIR'))" 2>/dev/null || echo "$DEFAULT_API_DIR")
    WEB_DIR=$(python3 -c "import json; f=open('$CONFIG_FILE'); c=json.load(f); print(c.get('paths',{}).get('web_dir','$DEFAULT_WEB_DIR'))" 2>/dev/null || echo "$DEFAULT_WEB_DIR")
    API_PORT=$(python3 -c "import json; f=open('$CONFIG_FILE'); c=json.load(f); print(c.get('api',{}).get('port',$DEFAULT_API_PORT))" 2>/dev/null || echo "$DEFAULT_API_PORT")
    WEB_PORT=$(python3 -c "import json; f=open('$CONFIG_FILE'); c=json.load(f); print(c.get('app',{}).get('web_port',$DEFAULT_WEB_PORT))" 2>/dev/null || echo "$DEFAULT_WEB_PORT")
    API_BASE_URL=$(python3 -c "import json; f=open('$CONFIG_FILE'); c=json.load(f); print(c.get('app',{}).get('api_base_url','http://localhost:3001/api'))" 2>/dev/null || echo "http://localhost:3001/api")
else
    API_DIR="$DEFAULT_API_DIR"
    WEB_DIR="$DEFAULT_WEB_DIR"
    API_PORT="$DEFAULT_API_PORT"
    WEB_PORT="$DEFAULT_WEB_PORT"
    API_BASE_URL="http://localhost:3001/api"
fi

echo "配置加载:"
echo "  API 目录: $API_DIR"
echo "  前端目录: $WEB_DIR"
echo "  API 端口: $API_PORT"
echo "  前端端口: $WEB_PORT"
echo ""

# 启动 API
echo "[1/2] 启动后端 API..."
cd "$API_DIR"

# 虚拟环境已存在，跳过创建
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

# 安装依赖
echo "安装依赖..."
if [ -d "venv" ]; then
    source venv/bin/activate
    pip install -q flask flask-cors flask-jwt-extended werkzeug gunicorn 2>/dev/null || true
    deactivate 2>/dev/null || true
else
    pip install -q flask flask-cors flask-jwt-extended werkzeug gunicorn 2>/dev/null || true
fi

# 停止旧进程
pkill -f "gunicorn.*api:app" || true
sleep 1

# 启动 API
mkdir -p logs
if [ -d "venv" ]; then
    venv/bin/gunicorn -w 4 -b 0.0.0.0:$API_PORT --access-logfile logs/access.log --error-logfile logs/error.log --daemon api:app
else
    gunicorn -w 4 -b 0.0.0.0:$API_PORT --access-logfile logs/access.log --error-logfile logs/error.log --daemon api:app
fi

# 启动前端
echo "[2/2] 启动前端..."
cd "$WEB_DIR"
pkill -f "python3 -m http.server $WEB_PORT" || true
sleep 1
python3 -m http.server $WEB_PORT > /dev/null 2>&1 &

sleep 2

echo ""
echo "======================================"
echo "   启动完成!"
echo "======================================"
echo ""
echo "前端访问地址: http://localhost:$WEB_PORT"
echo "API 地址:      $API_BASE_URL"
echo ""
