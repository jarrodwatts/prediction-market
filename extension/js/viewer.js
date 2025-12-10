/**
 * Twitch Extension - Viewer Script
 * Handles the betting overlay UI and wallet interactions
 */

// Configuration
const API_BASE_URL = 'https://your-domain.com'; // Update with actual domain
const PREDICTION_MARKET_ADDRESS = '0xcCfD5223e14D0A24aF2A80A6931c228F0a4137E0'; // Update with deployed address
const USDC_DECIMALS = 6;

// State
let twitchAuth = null;
let channelId = null;
let currentMarket = null;
let selectedOutcome = null;
let walletConnected = false;
let walletAddress = null;
let usdcBalance = 0;
let pollInterval = null;

// DOM Elements
const overlayContainer = document.getElementById('overlay-container');
const minimizedView = document.getElementById('minimized-view');
const expandedView = document.getElementById('expanded-view');
const noMarketView = document.getElementById('no-market');
const expandBtn = document.getElementById('expand-btn');
const collapseBtn = document.getElementById('collapse-btn');
const outcomesList = document.getElementById('outcomes-list');
const betAmounts = document.getElementById('bet-amounts');
const balanceDisplay = document.getElementById('balance-display');
const timerDisplay = document.getElementById('timer-display');
const connectState = document.getElementById('connect-state');
const connectBtn = document.getElementById('connect-btn');
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const miniOdds = document.getElementById('mini-odds');
const predictionTitle = document.getElementById('prediction-title');

// Initialize Twitch Extension
window.Twitch.ext.onAuthorized(function(auth) {
  console.log('Twitch Extension authorized');
  twitchAuth = auth;
  channelId = auth.channelId;
  
  // Start polling for active market
  startPolling();
});

// Handle expand/collapse
expandBtn.addEventListener('click', function() {
  minimizedView.classList.add('hidden');
  expandedView.classList.remove('hidden');
});

collapseBtn.addEventListener('click', function() {
  expandedView.classList.add('hidden');
  minimizedView.classList.remove('hidden');
});

// Handle connect wallet
connectBtn.addEventListener('click', async function() {
  await connectWallet();
});

// Handle bet button clicks
betAmounts.addEventListener('click', function(e) {
  if (e.target.classList.contains('bet-btn') && selectedOutcome !== null) {
    const amount = parseFloat(e.target.dataset.amount);
    placeBet(selectedOutcome, amount);
  }
});

/**
 * Start polling for active market
 */
function startPolling() {
  // Initial fetch
  fetchActiveMarket();
  
  // Poll every 5 seconds
  pollInterval = setInterval(fetchActiveMarket, 5000);
}

/**
 * Stop polling
 */
function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

/**
 * Fetch active market for this channel
 */
async function fetchActiveMarket() {
  if (!channelId) return;
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/markets/active?channelId=${channelId}`, {
      headers: {
        'Authorization': `Bearer ${twitchAuth.token}`,
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        showNoMarket();
        return;
      }
      throw new Error('Failed to fetch market');
    }
    
    const market = await response.json();
    updateMarketUI(market);
  } catch (error) {
    console.error('Error fetching market:', error);
    // Don't show error for network issues during polling
  }
}

/**
 * Update the UI with market data
 */
function updateMarketUI(market) {
  if (!market || market.state !== 'open') {
    showNoMarket();
    return;
  }
  
  currentMarket = market;
  
  // Show overlay
  overlayContainer.classList.remove('hidden');
  noMarketView.classList.add('hidden');
  
  // Update title
  predictionTitle.textContent = market.question;
  
  // Update outcomes
  renderOutcomes(market.outcomes, market.prices);
  
  // Update timer
  updateTimer(market.closesAt);
  
  // Update mini odds (show leading outcome)
  const leadingPrice = Math.max(...market.prices);
  miniOdds.textContent = `${Math.round(leadingPrice * 100)}%`;
  
  // Show connect state if wallet not connected
  if (!walletConnected) {
    showConnectState();
  }
}

/**
 * Render outcome buttons
 */
function renderOutcomes(outcomes, prices) {
  outcomesList.innerHTML = '';
  
  outcomes.forEach((outcome, index) => {
    const price = prices[index] || 0.5;
    const isYes = index === 0;
    
    const btn = document.createElement('button');
    btn.className = `outcome-btn ${isYes ? 'yes' : 'no'} ${selectedOutcome === index ? 'selected' : ''}`;
    btn.innerHTML = `
      <div class="outcome-title">${outcome}</div>
      <div class="outcome-odds">${Math.round(price * 100)}%</div>
    `;
    btn.addEventListener('click', () => selectOutcome(index));
    
    outcomesList.appendChild(btn);
  });
}

/**
 * Select an outcome to bet on
 */
function selectOutcome(index) {
  selectedOutcome = index;
  
  // Update UI
  document.querySelectorAll('.outcome-btn').forEach((btn, i) => {
    btn.classList.toggle('selected', i === index);
  });
  
  // Enable bet buttons
  document.querySelectorAll('.bet-btn').forEach(btn => {
    btn.disabled = !walletConnected;
  });
}

/**
 * Update countdown timer
 */
function updateTimer(closesAt) {
  const now = Date.now();
  const closeTime = closesAt * 1000;
  const remaining = closeTime - now;
  
  if (remaining <= 0) {
    timerDisplay.textContent = '⏱️ Closed';
    return;
  }
  
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  timerDisplay.textContent = `⏱️ ${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Show no active market state
 */
function showNoMarket() {
  overlayContainer.classList.add('hidden');
  noMarketView.classList.remove('hidden');
  currentMarket = null;
}

/**
 * Show connect wallet state
 */
function showConnectState() {
  connectState.classList.remove('hidden');
  betAmounts.classList.add('hidden');
}

/**
 * Hide connect wallet state
 */
function hideConnectState() {
  connectState.classList.add('hidden');
  betAmounts.classList.remove('hidden');
}

/**
 * Show loading state
 */
function showLoading() {
  loadingState.classList.remove('hidden');
}

/**
 * Hide loading state
 */
function hideLoading() {
  loadingState.classList.add('hidden');
}

/**
 * Show error state
 */
function showError(message) {
  document.getElementById('error-message').textContent = message;
  errorState.classList.remove('hidden');
}

/**
 * Hide error state
 */
function hideError() {
  errorState.classList.add('hidden');
}

/**
 * Connect wallet using Abstract Global Wallet popup
 */
async function connectWallet() {
  try {
    showLoading();
    
    // Open AGW popup for connection
    // This would typically open a popup to the main app for wallet connection
    const popup = window.open(
      `${API_BASE_URL}/connect-wallet?twitchId=${twitchAuth.userId}&returnUrl=${encodeURIComponent(window.location.href)}`,
      'wallet-connect',
      'width=400,height=600,scrollbars=yes'
    );
    
    // Listen for message from popup
    window.addEventListener('message', handleWalletMessage, { once: true });
    
  } catch (error) {
    console.error('Error connecting wallet:', error);
    hideLoading();
    showError('Failed to connect wallet');
  }
}

/**
 * Handle message from wallet connection popup
 */
function handleWalletMessage(event) {
  hideLoading();
  
  if (event.data.type === 'WALLET_CONNECTED') {
    walletConnected = true;
    walletAddress = event.data.address;
    usdcBalance = event.data.balance || 0;
    
    updateBalanceDisplay();
    hideConnectState();
    
    // Enable bet buttons if outcome selected
    if (selectedOutcome !== null) {
      document.querySelectorAll('.bet-btn').forEach(btn => {
        btn.disabled = false;
      });
    }
  } else if (event.data.type === 'WALLET_ERROR') {
    showError(event.data.message || 'Failed to connect wallet');
  }
}

/**
 * Update balance display
 */
function updateBalanceDisplay() {
  if (walletConnected) {
    balanceDisplay.textContent = `💰 $${usdcBalance.toFixed(2)}`;
  } else {
    balanceDisplay.textContent = '💰 --';
  }
}

/**
 * Place a bet
 */
async function placeBet(outcomeIndex, amount) {
  if (!currentMarket || !walletConnected) return;
  
  try {
    showLoading();
    
    // Call API to place bet
    // This would use a session key or trigger a transaction popup
    const response = await fetch(`${API_BASE_URL}/api/bet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${twitchAuth.token}`,
      },
      body: JSON.stringify({
        marketId: currentMarket.id,
        outcomeId: outcomeIndex,
        amount: amount,
        walletAddress: walletAddress,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to place bet');
    }
    
    const result = await response.json();
    
    hideLoading();
    
    // Update balance
    usdcBalance -= amount;
    updateBalanceDisplay();
    
    // Refresh market data
    await fetchActiveMarket();
    
    // Show success feedback
    console.log('Bet placed successfully:', result);
    
  } catch (error) {
    console.error('Error placing bet:', error);
    hideLoading();
    showError(error.message || 'Failed to place bet');
  }
}

// Update timer every second
setInterval(() => {
  if (currentMarket) {
    updateTimer(currentMarket.closesAt);
  }
}, 1000);

// Cleanup on unload
window.addEventListener('beforeunload', function() {
  stopPolling();
});

console.log('Prediction Market Extension loaded');

