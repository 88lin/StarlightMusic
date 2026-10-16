#!/usr/bin/env bash
#
# 在登录钥匙串里创建一张自签名代码签名证书，供本机给 StarlightMusic 的 .app 签名。
#
# 为什么需要：
#   macOS 上 ad-hoc 签名（codesign --sign -）每次构建的签名标识都不稳定，系统会把每个
#   新构建当成"另一个 App"，于是屏幕录制、本地网络、通知等权限每次都要重新授权。
#   换成固定的自签名证书后签名身份稳定，授权只需一次。
#
# ⚠️ 自签名证书只解决"本机权限身份稳定"这一件事：
#    - 它不能让别的 Mac 上的 Gatekeeper 放行（别人打开仍会提示"无法验证开发者"）；
#    - 也不能用于公证。
#    要真正分发给别人，必须用 Apple Developer ID 证书（$99/年）。
#
# 用法：
#   bash scripts/create-self-signed-cert.sh                    # 默认名称，装进登录钥匙串
#   bash scripts/create-self-signed-cert.sh "我的证书名"        # 自定义名称
#   bash scripts/create-self-signed-cert.sh --export-only DIR  # 只导出文件，不碰钥匙串
#
# 安装模式会依次：生成密钥与证书 → 打包 .p12 → 导入登录钥匙串 → 设为信任 → 打印身份。
# 过程中会弹出系统密码 / 授权对话框，属正常现象。
#
# 卸载：钥匙串访问 → 登录 → 找到该证书 → 右键删除。

set -euo pipefail

CERT_NAME="StarlightMusic Self-Signed"
DAYS=3650
EXPORT_ONLY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --export-only)
      EXPORT_ONLY="${2:-}"
      if [ -z "$EXPORT_ONLY" ]; then
        echo "错误：--export-only 需要指定输出目录" >&2
        exit 1
      fi
      shift 2
      ;;
    -h|--help)
      sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      CERT_NAME="$1"
      shift
      ;;
  esac
done

KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if [ -n "$EXPORT_ONLY" ]; then
  OUT_DIR="$EXPORT_ONLY"
else
  OUT_DIR="$(mktemp -d)"
fi
mkdir -p "$OUT_DIR"

cleanup() {
  # 安装模式下清掉含私钥的临时目录；导出模式保留产物
  if [ -z "$EXPORT_ONLY" ]; then
    rm -rf "$OUT_DIR"
  fi
}
trap cleanup EXIT

echo "==> 证书名称: $CERT_NAME"
echo "==> 有效期:   $DAYS 天"
echo "==> 工作目录: $OUT_DIR"
echo

# 1. openssl 配置。
#    注意：macOS 自带的是 LibreSSL，req 的 -addext 会被静默忽略（证书里一个扩展都没有，
#    codesign 直接拒用），所以必须走配置文件写 x509_extensions。
cat > "$OUT_DIR/openssl.cnf" <<EOF
[ req ]
distinguished_name = dn
x509_extensions = v3_codesign
prompt = no

[ dn ]
CN = $CERT_NAME

[ v3_codesign ]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
EOF

echo "==> 生成密钥与自签名证书…"
openssl req -x509 -newkey rsa:2048 -sha256 \
  -keyout "$OUT_DIR/key.pem" \
  -out "$OUT_DIR/cert.pem" \
  -days "$DAYS" -nodes \
  -config "$OUT_DIR/openssl.cnf" 2>/dev/null

# 2. 自检：确认 Code Signing 扩展真的写进去了
if ! openssl x509 -in "$OUT_DIR/cert.pem" -noout -text | grep -q "Code Signing"; then
  echo "错误：生成的证书缺少 Code Signing 扩展，codesign 无法使用。" >&2
  exit 1
fi
echo "    ✓ 已确认 Code Signing 扩展存在"

echo "==> 打包为 .p12…"
openssl pkcs12 -export \
  -inkey "$OUT_DIR/key.pem" \
  -in "$OUT_DIR/cert.pem" \
  -out "$OUT_DIR/cert.p12" \
  -passout pass:

if [ -n "$EXPORT_ONLY" ]; then
  echo
  echo "==> 已导出（未导入钥匙串）："
  ls -1 "$OUT_DIR"/key.pem "$OUT_DIR"/cert.pem "$OUT_DIR"/cert.p12
  echo
  echo "如需导入钥匙串，去掉 --export-only 重新运行即可。"
  exit 0
fi

# 3. 导入登录钥匙串，并授权 codesign / security 使用私钥（否则每次签名都弹窗）
echo "==> 导入登录钥匙串（可能要求输入密码）…"
security import "$OUT_DIR/cert.p12" \
  -k "$KEYCHAIN" \
  -P "" \
  -T /usr/bin/codesign \
  -T /usr/bin/security

# 4. 设为信任，让它在代码签名场景下有效
echo "==> 设置信任（可能弹出授权对话框）…"
security add-trusted-cert \
  -r trustRoot \
  -p codeSign \
  -k "$KEYCHAIN" \
  "$OUT_DIR/cert.pem"

# 5. 校验
echo
echo "==> 当前可用的代码签名身份："
security find-identity -v -p codesigning

echo
if security find-identity -v -p codesigning | grep -q "$CERT_NAME"; then
  echo "✓ 完成。现在直接执行 npm run build:mac 即可，electron-builder 会自动发现并使用这张证书。"
else
  echo "✗ 没有在身份列表里看到「$CERT_NAME」。" >&2
  echo "  请打开「钥匙串访问」确认证书存在，且其「代码签名」信任项已设为「始终信任」。" >&2
  exit 1
fi
