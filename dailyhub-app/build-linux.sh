#!/bin/bash
# ====================================
# Linux 打包脚本 - 日历日程管理应用
# ====================================

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo "========================================"
echo "  日历日程管理 - Linux 打包工具"
echo "========================================"
echo ""

# 检查是否在正确的目录
if [ ! -f "src-tauri/tauri.conf.json" ]; then
    echo -e "${RED}[错误]${NC} 请在 calendar-app 目录下运行此脚本"
    exit 1
fi

# ====================================
# 1. 复制前端文件到 dist 目录
# ====================================
echo -e "${GREEN}[1/4]${NC} 复制前端文件到 dist 目录..."

# 创建 dist 目录结构
mkdir -p dist/css
mkdir -p dist/js
mkdir -p dist/icons

# 复制文件
cp -f index.html dist/index.html
cp -f manifest.json dist/manifest.json
cp -f sw.js dist/sw.js
cp -f css/style.css dist/css/style.css
cp -f js/*.js dist/js/

echo "      - index.html 已复制"
echo "      - manifest.json 已复制"
echo "      - sw.js 已复制"
echo "      - css/style.css 已复制"
echo "      - js/*.js 已复制"

# ====================================
# 2. 检查环境依赖
# ====================================
echo ""
echo -e "${GREEN}[2/4]${NC} 检查环境依赖..."

# 检查 Rust
if ! command -v cargo &> /dev/null; then
    echo -e "${YELLOW}[警告]${NC} 未检测到 Rust，请先安装 Rust"
    echo "        安装命令: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi
echo "      - Rust 已安装"

# 检查 WebView (Linux 需要 webkit2gtk)
if ! command -v dpkg &> /dev/null; then
    echo -e "${YELLOW}[提示]${NC} 无法检查系统包管理器"
else
    if ! dpkg -l | grep -q webkit2gtk-4.1; then
        echo -e "${YELLOW}[提示]${NC} 可能需要安装 webkit2gtk"
        echo "        Ubuntu/Debian: sudo apt install libwebkit2gtk-4.1-dev"
        echo "        Fedora: sudo dnf install webkit2gtk4.1-devel"
    else
        echo "      - webkit2gtk 已安装"
    fi
fi

# ====================================
# 3. 执行打包命令
# ====================================
echo ""
echo -e "${GREEN}[3/4]${NC} 开始打包..."
echo ""

cd src-tauri

# 执行 Tauri 构建命令
cargo tauri build

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}[错误]${NC} 打包失败！"
    echo ""
    echo "可能的原因:"
    echo "  1. 缺少系统依赖库"
    echo "  2. Rust 编译环境配置问题"
    echo ""
    echo "解决方案:"
    echo "  Ubuntu/Debian:"
    echo "    sudo apt update"
    echo "    sudo apt install libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev"
    echo ""
    cd ..
    exit 1
fi

cd ..

# ====================================
# 4. 输出安装包位置
# ====================================
echo ""
echo -e "${GREEN}[4/4]${NC} 打包完成！"
echo ""
echo "========================================"
echo "  安装包位置"
echo "========================================"
echo ""

if [ -d "src-tauri/target/release/bundle/deb" ]; then
    echo "DEB 包 (Ubuntu/Debian):"
    ls -lh src-tauri/target/release/bundle/deb/*.deb 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
    echo ""
    echo "完整路径: src-tauri/target/release/bundle/deb/"
    echo ""
fi

if [ -d "src-tauri/target/release/bundle/appimage" ]; then
    echo "AppImage (通用 Linux):"
    ls -lh src-tauri/target/release/bundle/appimage/*.AppImage 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
    echo ""
    echo "完整路径: src-tauri/target/release/bundle/appimage/"
    echo ""
fi

echo "========================================"
echo ""
