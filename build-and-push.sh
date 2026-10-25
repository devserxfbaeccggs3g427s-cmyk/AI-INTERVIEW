#!/bin/bash
set -e

# ==================== 1. KIỂM TRA & TỰ ĐỘNG BẬT DOCKER TRÊN MACOS ====================
echo "==> Kiểm tra trạng thái Docker trên macOS..."
if ! docker info > /dev/null 2>&1; then
    echo "⚠️ Docker Desktop chưa chạy. Đang tự động mở Docker Desktop..."
    open -a Docker
    echo "⏳ Đang đợi Docker khởi động..."
    while ! docker info > /dev/null 2>&1; do
        sleep 2
    done
    echo "✅ Docker đã khởi động và sẵn sàng!"
else
    echo "✅ Docker đang hoạt động bình thường."
fi
# =================================================================================

# Lấy tham số truyền vào từ dòng lệnh
TAG=$1       # Tham số 1: Version tag (VD: 1.0.5)
VPS_IP=$2    # Tham số 2: IP của VPS (VD: 123.45.67.89)

# Cấu hình username mặc định của VPS (bạn có thể đổi thành root hoặc tên user của bạn)
VPS_USER=${VPS_USER:-"root"}

# Kiểm tra xem người dùng đã truyền đủ tham số chưa
if [ -z "$TAG" ] || [ -z "$VPS_IP" ]; then
    echo "❌ Lỗi: Thiếu tham số!"
    echo "Cách sử dụng: ./build-and-push.sh <version_tag> <vps_ip>"
    echo "Ví dụ: ./build-and-push.sh 1.0.5 123.45.67.89"
    exit 1
fi

echo "==> Bắt đầu build với TAG: $TAG"

# (Tùy chọn) Biến môi trường cho build-arg
NEXT_PUBLIC_PROVIDER_ENABLE_LIST=${NEXT_PUBLIC_PROVIDER_ENABLE_LIST:-"anthropic,openai,gemini,custom"}
SITE_DOMAIN_FOR_BUILD=${SITE_DOMAIN_FOR_BUILD:-"${VPS_USER}:12213"}

# 2) Build & push Image App (Next.js)
echo "==> 1. Đang build và push Image App (Next.js)..."
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg NEXT_PUBLIC_PROVIDER_ENABLE="${NEXT_PUBLIC_PROVIDER_ENABLE_LIST}" \
  --build-arg NEXT_PUBLIC_BASE_URL="https://${SITE_DOMAIN_FOR_BUILD}" \
  -t ngocnqph12806/interview-ai-studio:${TAG} \
  -t ngocnqph12806/interview-ai-studio:latest \
  --push .

# 3) Build & push Image Caddy
echo "==> 2. Đang build và push Image Caddy..."
docker buildx build \
  -f Dockerfile.caddy \
  --platform linux/amd64,linux/arm64 \
  -t ngocnqph12806/interview-ai-studio-caddy:${TAG} \
  -t ngocnqph12806/interview-ai-studio-caddy:latest \
  --push .

# ==================== 4. TỰ ĐỘNG SSH VÀ CHẠY LỆNH TRÊN VPS ====================
TARGET_HOST="${VPS_USER}@${VPS_IP}"

echo "==> 3. Đang kết nối SSH tới $TARGET_HOST để thực thi cập nhật..."
ssh "$TARGET_HOST" << 'EOF'
  echo "🚀 Đã vào VPS thành công!"

  # Di chuyển vào thư mục dự án trên VPS
  cd /opt/interview-ai-studio

  # Chạy script redeploy để stop container cũ, xóa image cũ và compose up
  ./redeploy.sh

  echo "✅ Hoàn tất quá trình cập nhật trên VPS!"
EOF
# =================================================================================

echo "==> 🎉 Hoàn thành toàn bộ quy trình từ Mac lên VPS ($VPS_IP) với tag: $TAG!"