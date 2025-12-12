#!/bin/bash
# setup-tunnel.sh - One-time setup for a named Cloudflare tunnel
#
# This creates a persistent tunnel with a stable URL so you never
# need to update Twitch OAuth redirect URLs again.
#
# Prerequisites: cloudflared installed

set -e

TUNNEL_NAME="prediction-market-dev"
CONFIG_DIR="$HOME/.cloudflared"
TUNNEL_CONFIG="$CONFIG_DIR/config.yml"
ENV_FILE=".env.local"
LOCAL_PORT="${PORT:-3000}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║      🔧 Cloudflare Named Tunnel Setup (One-Time)              ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo -e "${RED}❌ cloudflared is not installed${NC}"
    echo "Install it first: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    exit 1
fi

# Step 1: Login to Cloudflare (if not already)
echo -e "${BLUE}[1/4] 🔐 Checking Cloudflare authentication...${NC}"

if [ ! -f "$CONFIG_DIR/cert.pem" ]; then
    echo -e "${YELLOW}      You need to login to Cloudflare first.${NC}"
    echo -e "${YELLOW}      A browser window will open for authentication.${NC}"
    echo ""
    read -p "Press Enter to continue..."
    cloudflared tunnel login
    echo -e "${GREEN}      ✅ Authenticated with Cloudflare${NC}"
else
    echo -e "${GREEN}      ✅ Already authenticated${NC}"
fi

# Step 2: Check if tunnel already exists
echo -e "${BLUE}[2/4] 🔍 Checking for existing tunnel...${NC}"

EXISTING_TUNNEL=$(cloudflared tunnel list | grep "$TUNNEL_NAME" || true)

if [ -n "$EXISTING_TUNNEL" ]; then
    echo -e "${GREEN}      ✅ Tunnel '${TUNNEL_NAME}' already exists${NC}"
    TUNNEL_ID=$(echo "$EXISTING_TUNNEL" | awk '{print $1}')
else
    echo -e "${YELLOW}      Creating new tunnel '${TUNNEL_NAME}'...${NC}"
    cloudflared tunnel create "$TUNNEL_NAME"
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
    echo -e "${GREEN}      ✅ Tunnel created with ID: ${TUNNEL_ID}${NC}"
fi

# The stable URL for the tunnel
TUNNEL_URL="https://${TUNNEL_ID}.cfargotunnel.com"

# Step 3: Create/update tunnel config
echo -e "${BLUE}[3/4] 📝 Creating tunnel configuration...${NC}"

mkdir -p "$CONFIG_DIR"

cat > "$TUNNEL_CONFIG" << EOF
# Cloudflare Tunnel config for prediction-market dev
tunnel: ${TUNNEL_ID}
credentials-file: ${CONFIG_DIR}/${TUNNEL_ID}.json

ingress:
  - service: http://localhost:${LOCAL_PORT}
EOF

echo -e "${GREEN}      ✅ Config written to ${TUNNEL_CONFIG}${NC}"

# Step 4: Update .env.local
echo -e "${BLUE}[4/4] 📝 Updating .env.local with permanent URL...${NC}"

if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "${ENV_FILE}.bak"
    
    if grep -q "^NEXTAUTH_URL=" "$ENV_FILE"; then
        sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=${TUNNEL_URL}|" "$ENV_FILE"
    else
        echo "NEXTAUTH_URL=${TUNNEL_URL}" >> "$ENV_FILE"
    fi
    
    if grep -q "^NEXT_PUBLIC_APP_URL=" "$ENV_FILE"; then
        sed -i "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=${TUNNEL_URL}/|" "$ENV_FILE"
    else
        echo "NEXT_PUBLIC_APP_URL=${TUNNEL_URL}/" >> "$ENV_FILE"
    fi
else
    echo "NEXTAUTH_URL=${TUNNEL_URL}" > "$ENV_FILE"
    echo "NEXT_PUBLIC_APP_URL=${TUNNEL_URL}/" >> "$ENV_FILE"
fi

echo -e "${GREEN}      ✅ Environment updated${NC}"

# Generate redirect URL
REDIRECT_URL="${TUNNEL_URL}/api/auth/callback/twitch"

# Copy to clipboard if possible
CLIPBOARD_CMD=""
if command -v clip.exe &> /dev/null; then
    CLIPBOARD_CMD="clip.exe"
elif command -v xclip &> /dev/null; then
    CLIPBOARD_CMD="xclip -selection clipboard"
elif command -v pbcopy &> /dev/null; then
    CLIPBOARD_CMD="pbcopy"
fi

if [ -n "$CLIPBOARD_CMD" ]; then
    echo -n "$REDIRECT_URL" | $CLIPBOARD_CMD
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  🎉 Named Tunnel Setup Complete!                              ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Your ${YELLOW}permanent${NC} tunnel URL:"
echo ""
echo -e "  ${CYAN}${TUNNEL_URL}${NC}"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}ONE-TIME TWITCH SETUP${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "Add this OAuth Redirect URL to your Twitch app (${GREEN}just once!${NC}):"
echo ""
echo -e "  ${GREEN}${REDIRECT_URL}${NC}"
echo ""
if [ -n "$CLIPBOARD_CMD" ]; then
echo -e "  ${GREEN}📋 Copied to clipboard!${NC}"
echo ""
fi
echo -e "Twitch Console: ${BLUE}https://dev.twitch.tv/console/apps${NC}"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "From now on, just run:"
echo ""
echo -e "  ${CYAN}pnpm dev:tunnel${NC}  - Start the tunnel"
echo -e "  ${CYAN}pnpm dev:full${NC}   - Start tunnel + Next.js together"
echo ""
echo -e "The URL will ${GREEN}never change${NC}, so no more Twitch updates needed! 🎉"
echo ""
