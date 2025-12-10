/**
 * Twitch Extension - Config Script
 * Handles streamer setup and configuration
 */

// Configuration
const API_BASE_URL = 'https://your-domain.com'; // Update with actual domain
const TWITCH_AUTH_URL = `${API_BASE_URL}/api/auth/signin/twitch`;

// State
let twitchAuth = null;
let broadcasterConfig = null;
let walletAddress = null;

// DOM Elements
const channelName = document.getElementById('channel-name');
const stepWallet = document.getElementById('step-wallet');
const connectWalletBtn = document.getElementById('connect-wallet-btn');
const walletStatus = document.getElementById('wallet-status');
const walletConnected = document.getElementById('wallet-connected');
const walletAddressDisplay = document.getElementById('wallet-address');
const stepEventsub = document.getElementById('step-eventsub');
const authorizeBtn = document.getElementById('authorize-btn');
const authStatus = document.getElementById('auth-status');
const settingsSection = document.getElementById('settings-section');
const statsSection = document.getElementById('stats-section');
const liquidityAmount = document.getElementById('liquidity-amount');
const saveSettingsBtn = document.getElementById('save-settings-btn');

// Initialize Twitch Extension
window.Twitch.ext.onAuthorized(function(auth) {
  console.log('Config page authorized');
  twitchAuth = auth;
  
  // Update channel name
  channelName.textContent = `Channel ID: ${auth.channelId}`;
  
  // Load saved configuration
  loadConfiguration();
});

// Handle configuration changes from Twitch
window.Twitch.ext.configuration.onChanged(function() {
  console.log('Configuration changed');
  loadConfiguration();
});

// Connect wallet button
connectWalletBtn.addEventListener('click', async function() {
  await connectWallet();
});

// Authorize button
authorizeBtn.addEventListener('click', function(e) {
  e.preventDefault();
  authorizeWithTwitch();
});

// Save settings button
saveSettingsBtn.addEventListener('click', async function() {
  await saveSettings();
});

/**
 * Load saved configuration from Twitch Configuration Service
 */
function loadConfiguration() {
  if (window.Twitch.ext.configuration.broadcaster) {
    try {
      broadcasterConfig = JSON.parse(window.Twitch.ext.configuration.broadcaster.content);
      console.log('Loaded config:', broadcasterConfig);
      
      if (broadcasterConfig.walletAddress) {
        showWalletConnected(broadcasterConfig.walletAddress);
      }
      
      if (broadcasterConfig.authorized) {
        showAuthorized();
      }
      
      if (broadcasterConfig.defaultLiquidity) {
        liquidityAmount.value = broadcasterConfig.defaultLiquidity;
      }
      
      // Show settings if setup is complete
      if (broadcasterConfig.walletAddress && broadcasterConfig.authorized) {
        showSettings();
        loadStats();
      }
    } catch (e) {
      console.error('Error parsing configuration:', e);
      broadcasterConfig = {};
    }
  } else {
    broadcasterConfig = {};
  }
}

/**
 * Save configuration to Twitch Configuration Service
 */
function saveConfiguration(config) {
  broadcasterConfig = { ...broadcasterConfig, ...config };
  
  window.Twitch.ext.configuration.set(
    'broadcaster',
    '1',
    JSON.stringify(broadcasterConfig)
  );
  
  console.log('Configuration saved:', broadcasterConfig);
}

/**
 * Connect wallet using Abstract Global Wallet
 */
async function connectWallet() {
  try {
    connectWalletBtn.disabled = true;
    connectWalletBtn.textContent = 'Connecting...';
    
    // Open AGW popup for connection
    const popup = window.open(
      `${API_BASE_URL}/connect-wallet?mode=streamer&channelId=${twitchAuth.channelId}`,
      'wallet-connect',
      'width=400,height=600,scrollbars=yes'
    );
    
    // Listen for message from popup
    window.addEventListener('message', function handler(event) {
      if (event.data.type === 'WALLET_CONNECTED') {
        window.removeEventListener('message', handler);
        
        walletAddress = event.data.address;
        saveConfiguration({ walletAddress: walletAddress });
        showWalletConnected(walletAddress);
        
        connectWalletBtn.disabled = false;
        connectWalletBtn.textContent = 'Connect Wallet';
      } else if (event.data.type === 'WALLET_ERROR') {
        window.removeEventListener('message', handler);
        
        alert('Failed to connect wallet: ' + (event.data.message || 'Unknown error'));
        
        connectWalletBtn.disabled = false;
        connectWalletBtn.textContent = 'Connect Wallet';
      }
    });
    
  } catch (error) {
    console.error('Error connecting wallet:', error);
    alert('Failed to connect wallet');
    
    connectWalletBtn.disabled = false;
    connectWalletBtn.textContent = 'Connect Wallet';
  }
}

/**
 * Show wallet connected state
 */
function showWalletConnected(address) {
  walletAddress = address;
  walletStatus.classList.add('hidden');
  walletConnected.classList.remove('hidden');
  walletAddressDisplay.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
  connectWalletBtn.classList.add('hidden');
  
  stepWallet.classList.add('completed');
  stepWallet.querySelector('.step-number').textContent = '✓';
}

/**
 * Authorize with Twitch for EventSub
 */
function authorizeWithTwitch() {
  // Redirect to our NextAuth Twitch login
  // After auth, user will be redirected back and we'll store the session
  const returnUrl = window.location.href;
  const authUrl = `${API_BASE_URL}/api/auth/signin/twitch?callbackUrl=${encodeURIComponent(returnUrl)}`;
  
  // Open in popup
  const popup = window.open(authUrl, 'twitch-auth', 'width=500,height=700');
  
  // Poll for completion
  const checkClosed = setInterval(function() {
    if (popup.closed) {
      clearInterval(checkClosed);
      // Check if authorization was successful
      checkAuthorizationStatus();
    }
  }, 1000);
}

/**
 * Check if Twitch authorization was successful
 */
async function checkAuthorizationStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/streamer/status?channelId=${twitchAuth.channelId}`);
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.authorized) {
        saveConfiguration({ authorized: true });
        showAuthorized();
        
        // Show settings
        showSettings();
        loadStats();
      }
    }
  } catch (error) {
    console.error('Error checking authorization:', error);
  }
}

/**
 * Show authorized state
 */
function showAuthorized() {
  authorizeBtn.classList.add('hidden');
  authStatus.classList.remove('hidden');
  
  stepEventsub.classList.add('completed');
  stepEventsub.querySelector('.step-number').textContent = '✓';
}

/**
 * Show settings section
 */
function showSettings() {
  settingsSection.classList.remove('hidden');
  statsSection.classList.remove('hidden');
}

/**
 * Load streamer stats
 */
async function loadStats() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/streamer/stats?channelId=${twitchAuth.channelId}`);
    
    if (response.ok) {
      const stats = await response.json();
      
      document.getElementById('total-markets').textContent = stats.totalMarkets || 0;
      document.getElementById('total-volume').textContent = `$${(stats.totalVolume || 0).toLocaleString()}`;
      document.getElementById('total-fees').textContent = `$${(stats.totalFees || 0).toFixed(2)}`;
    }
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

/**
 * Save settings
 */
async function saveSettings() {
  const settings = {
    defaultLiquidity: liquidityAmount.value,
  };
  
  saveConfiguration(settings);
  
  // Also save to backend
  try {
    await fetch(`${API_BASE_URL}/api/streamer/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channelId: twitchAuth.channelId,
        ...settings,
      }),
    });
    
    alert('Settings saved!');
  } catch (error) {
    console.error('Error saving settings:', error);
    alert('Settings saved locally. Server sync failed.');
  }
}

console.log('Config script loaded');

