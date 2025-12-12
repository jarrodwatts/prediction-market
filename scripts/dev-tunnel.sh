#!/bin/bash
# dev-tunnel.sh - Start tunnel (cloudflared or ngrok)
#
# Usage: ./scripts/dev-tunnel.sh
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

TUNNEL_PID=""
TUNNEL_LOG=""

# Check if named tunnel is configured
use_named_tunnel() {
    [ -f "$TUNNEL_CONFIG" ] && [ -f "$CONFIG_DIR/cert.pem" ] && cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"
}

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Stopping tunnel...${NC}"
    [ -n "$TUNNEL_PID" ] && kill $TUNNEL_PID 2>/dev/null || true
    [ -n "$TUNNEL_LOG" ] && rm -f "$TUNNEL_LOG"
    exit 0
}
trap cleanup SIGINT SIGTERM

# Try cloudflared quick tunnel (non-blocking check)
try_cloudflared_quick() {
    TUNNEL_LOG=$(mktemp)
    cloudflared tunnel --url http://localhost:$LOCAL_PORT 2>&1 | tee "$TUNNEL_LOG" &
    TUNNEL_PID=$!
    
    TUNNEL_URL=""
    ATTEMPTS=0
    while [ -z "$TUNNEL_URL" ] && [ $ATTEMPTS -lt 15 ]; do
        sleep 1
        ATTEMPTS=$((ATTEMPTS + 1))
        # Check for error early
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
    ngrok http $LOCAL_PORT --log=stdout 2>&1 | tee "$TUNNEL_LOG" &
    TUNNEL_PID=$!
    
    TUNNEL_URL=""
    ATTEMPTS=0
    while [ -z "$TUNNEL_URL" ] && [ $ATTEMPTS -lt 15 ]; do
        sleep 1
        ATTEMPTS=$((ATTEMPTS + 1))
        TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.ngrok-free\.app' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
        if [ -z "$TUNNEL_URL" ]; then
            TUNNEL_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.ngrok[^"]*' | head -1 || true)
        fi
    done
    
    [ -n "$TUNNEL_URL" ]
}

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    🚇 Dev Tunnel                              ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

TUNNEL_URL=""

if use_named_tunnel; then
    echo -e "${GREEN}✅ Using named tunnel '${TUNNEL_NAME}' (stable URL)${NC}"
    
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
    TUNNEL_URL="https://${TUNNEL_ID}.cfargotunnel.com"
    
    echo -e "${BLUE}🌐 URL: ${TUNNEL_URL}${NC}"
    
    if [ -f "$ENV_FILE" ]; then
        CURRENT_URL=$(grep "^NEXTAUTH_URL=" "$ENV_FILE" | cut -d'=' -f2 || true)
        if [ "$CURRENT_URL" != "$TUNNEL_URL" ]; then
            sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=${TUNNEL_URL}|" "$ENV_FILE"
            sed -i "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=${TUNNEL_URL}/|" "$ENV_FILE"
            echo -e "${GREEN}✅ Updated .env.local${NC}"
        fi
    fi
    
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    echo ""
    cloudflared tunnel run "$TUNNEL_NAME"
    
else
    # Try cloudflared first
    echo -e "${YELLOW}⚡ Trying cloudflared...${NC}"
    if try_cloudflared_quick; then
        echo -e "${GREEN}✅ Cloudflared tunnel: ${TUNNEL_URL}${NC}"
    else
        echo -e "${YELLOW}⚠️  Cloudflared failed (API may be down)${NC}"
        
        if command -v ngrok &> /dev/null; then
            echo -e "${YELLOW}⚡ Trying ngrok...${NC}"
            if try_ngrok; then
                echo -e "${GREEN}✅ Ngrok tunnel: ${TUNNEL_URL}${NC}"
            fi
        else
            echo -e "${YELLOW}💡 Tip: Install ngrok as backup: https://ngrok.com/download${NC}"
        fi
    fi
    
    if [ -z "$TUNNEL_URL" ]; then
        echo -e "${RED}❌ Could not start any tunnel${NC}"
        echo -e "${YELLOW}Cloudflare's API may be having issues. Try again later or install ngrok.${NC}"
        exit 1
    fi
    
    # Update .env.local
    if [ -f "$ENV_FILE" ]; then
        cp "$ENV_FILE" "${ENV_FILE}.bak"
        sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=${TUNNEL_URL}|" "$ENV_FILE"
        sed -i "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=${TUNNEL_URL}/|" "$ENV_FILE"
        echo -e "${GREEN}✅ Updated .env.local${NC}"
    fi
    
    REDIRECT_URL="${TUNNEL_URL}/api/auth/callback/twitch"
    
    if command -v clip.exe &> /dev/null; then
        echo -n "$REDIRECT_URL" | clip.exe
        echo -e "${GREEN}📋 Copied to clipboard${NC}"
    fi
    
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "📌 Twitch redirect: ${GREEN}${REDIRECT_URL}${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    
    wait $TUNNEL_PID
fi
