#!/bin/bash
# dev-full.sh - Start tunnel + Next.js dev server together
#
# Usage: ./scripts/dev-full.sh
#
# Tries cloudflared first, falls back to ngrok if cloudflared fails.

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

# PIDs to track
NEXT_PID=""
TUNNEL_PID=""
TUNNEL_LOG=""

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down...${NC}"
    [ -n "$NEXT_PID" ] && kill $NEXT_PID 2>/dev/null || true
    [ -n "$TUNNEL_PID" ] && kill $TUNNEL_PID 2>/dev/null || true
    [ -n "$TUNNEL_LOG" ] && rm -f "$TUNNEL_LOG"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Check if named tunnel is configured
use_named_tunnel() {
    [ -f "$TUNNEL_CONFIG" ] && [ -f "$CONFIG_DIR/cert.pem" ] && cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"
}

# Try cloudflared quick tunnel
try_cloudflared() {
    TUNNEL_LOG=$(mktemp)
    cloudflared tunnel --url http://localhost:$LOCAL_PORT 2>&1 > "$TUNNEL_LOG" &
    TUNNEL_PID=$!
    
    # Wait for URL (with shorter timeout to fail fast)
    TUNNEL_URL=""
    ATTEMPTS=0
    while [ -z "$TUNNEL_URL" ] && [ $ATTEMPTS -lt 15 ]; do
        sleep 1
        ATTEMPTS=$((ATTEMPTS + 1))
        # Check for error
        if grep -q "failed to unmarshal quick Tunnel\|Error.*trycloudflare" "$TUNNEL_LOG" 2>/dev/null; then
            kill $TUNNEL_PID 2>/dev/null || true
            TUNNEL_PID=""
            return 1
        fi
        TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
    done
    
    [ -n "$TUNNEL_URL" ]
}

# Try ngrok
try_ngrok() {
    if ! command -v ngrok &> /dev/null; then
        return 1
    fi
    
    TUNNEL_LOG=$(mktemp)
    ngrok http $LOCAL_PORT --log=stdout > "$TUNNEL_LOG" 2>&1 &
    TUNNEL_PID=$!
    
    # Wait for URL
    TUNNEL_URL=""
    ATTEMPTS=0
    while [ -z "$TUNNEL_URL" ] && [ $ATTEMPTS -lt 15 ]; do
        sleep 1
        ATTEMPTS=$((ATTEMPTS + 1))
        # ngrok shows URL in log or via API
        TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.ngrok-free\.app' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
        # Also try ngrok API
        if [ -z "$TUNNEL_URL" ]; then
            TUNNEL_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.ngrok[^"]*' | head -1 || true)
        fi
    done
    
    [ -n "$TUNNEL_URL" ]
}

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║         🎮 Prediction Market - Full Dev Environment          ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Step 1: Get/start tunnel and determine URL
TUNNEL_URL=""

if use_named_tunnel; then
    echo -e "${BLUE}[1/3] 🚇 Using named tunnel '${TUNNEL_NAME}' (stable URL)${NC}"
    
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
    TUNNEL_URL="https://${TUNNEL_ID}.cfargotunnel.com"
    
    echo -e "${GREEN}      ✅ URL: ${TUNNEL_URL}${NC}"
    
    # Start named tunnel in background
    cloudflared tunnel run "$TUNNEL_NAME" &
    TUNNEL_PID=$!
    
else
    echo -e "${BLUE}[1/3] 🚇 Starting tunnel...${NC}"
    
    # Try cloudflared first
    echo -e "${YELLOW}      Trying cloudflared...${NC}"
    if try_cloudflared; then
        echo -e "${GREEN}      ✅ Cloudflared: ${TUNNEL_URL}${NC}"
    else
        echo -e "${YELLOW}      ⚠️  Cloudflared failed (API may be down)${NC}"
        
        # Try ngrok as fallback
        if command -v ngrok &> /dev/null; then
            echo -e "${YELLOW}      Trying ngrok...${NC}"
            if try_ngrok; then
                echo -e "${GREEN}      ✅ Ngrok: ${TUNNEL_URL}${NC}"
            else
                echo -e "${RED}      ❌ Ngrok also failed${NC}"
            fi
        else
            echo -e "${YELLOW}      💡 Install ngrok as backup: https://ngrok.com/download${NC}"
        fi
    fi
    
    if [ -z "$TUNNEL_URL" ]; then
        echo -e "${RED}      ❌ Could not start any tunnel${NC}"
        echo -e "${YELLOW}      Cloudflare's quick tunnel API may be having issues.${NC}"
        echo -e "${YELLOW}      Try again in a few minutes, or install ngrok as backup.${NC}"
        exit 1
    fi
fi

# Step 2: Update .env.local
echo -e "${BLUE}[2/3] 📝 Updating .env.local...${NC}"

if [ -f "$ENV_FILE" ]; then
    CURRENT_URL=$(grep "^NEXTAUTH_URL=" "$ENV_FILE" | cut -d'=' -f2 || true)
    if [ "$CURRENT_URL" != "$TUNNEL_URL" ]; then
        cp "$ENV_FILE" "${ENV_FILE}.bak"
        sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=${TUNNEL_URL}|" "$ENV_FILE"
        sed -i "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=${TUNNEL_URL}/|" "$ENV_FILE"
        echo -e "${GREEN}      ✅ Updated${NC}"
    else
        echo -e "${GREEN}      ✅ Already up to date${NC}"
    fi
else
    echo "NEXTAUTH_URL=${TUNNEL_URL}" > "$ENV_FILE"
    echo "NEXT_PUBLIC_APP_URL=${TUNNEL_URL}/" >> "$ENV_FILE"
    echo -e "${GREEN}      ✅ Created${NC}"
fi

# Step 3: Start Next.js
echo -e "${BLUE}[3/3] 🌐 Starting Next.js dev server...${NC}"

pnpm dev &
NEXT_PID=$!

# Wait a moment for Next.js to start
sleep 3

# Show info
REDIRECT_URL="${TUNNEL_URL}/api/auth/callback/twitch"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  🎉 Development environment ready!                            ║${NC}"
echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}                                                               ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Local:  ${BLUE}http://localhost:${LOCAL_PORT}${NC}                              ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Public: ${BLUE}${TUNNEL_URL}${NC}"
echo -e "${GREEN}║${NC}                                                               ${GREEN}║${NC}"

if ! use_named_tunnel; then
    # Only show Twitch info for quick tunnels
    echo -e "${GREEN}║${NC}  ${YELLOW}Twitch redirect:${NC}                                            ${GREEN}║${NC}"
    echo -e "${GREEN}║${NC}  ${CYAN}${REDIRECT_URL}${NC}"
    echo -e "${GREEN}║${NC}                                                               ${GREEN}║${NC}"
    
    # Copy to clipboard
    if command -v clip.exe &> /dev/null; then
        echo -n "$REDIRECT_URL" | clip.exe
        echo -e "${GREEN}║${NC}  ${GREEN}📋 Copied to clipboard${NC}                                      ${GREEN}║${NC}"
    fi
fi

echo -e "${GREEN}║${NC}                                                               ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  ${YELLOW}Press Ctrl+C to stop${NC}                                       ${GREEN}║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Wait for Next.js (tunnel runs in background)
wait $NEXT_PID
