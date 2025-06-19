const axios = require('axios');
const { getHttpEndpoint } = require('@orbs-network/ton-access');
const logger = require('./logger');

// Regex patterns for wallet address detection
const TON_ADDRESS_REGEX = /\b[A-Za-z0-9_-]{48}\b/g;
const ETH_ADDRESS_REGEX = /\b0x[a-fA-F0-9]{40}\b/g;

/**
 * Detect wallet address in user message
 * @param {string} message - User message to analyze
 * @returns {object|null} - {type: 'TON'|'ETH', address: string} or null
 */
function detectWalletAddress(message) {
  try {
    // Check for TON address
    const tonMatch = message.match(TON_ADDRESS_REGEX);
    if (tonMatch && tonMatch[0]) {
      logger.info('TON wallet address detected', { 
        addressLength: tonMatch[0].length,
        addressPreview: tonMatch[0].substring(0, 8) + '...'
      });
      return { type: 'TON', address: tonMatch[0] };
    }
    
    // Check for Ethereum address
    const ethMatch = message.match(ETH_ADDRESS_REGEX);
    if (ethMatch && ethMatch[0]) {
      logger.info('ETH wallet address detected', { 
        addressLength: ethMatch[0].length,
        addressPreview: ethMatch[0].substring(0, 8) + '...'
      });
      return { type: 'ETH', address: ethMatch[0] };
    }
    
    return null;
  } catch (error) {
    logger.error('Error detecting wallet address', { 
      error: error.message,
      messageLength: message.length 
    });
    return null;
  }
}

/**
 * Fetch TON wallet balance and basic info
 * @param {string} address - TON wallet address
 * @returns {object} - {balance: string, balanceTON: number, success: boolean, error?: string}
 */
async function getTonWalletData(address) {
  const startTime = Date.now();
  
  try {
    logger.info('Fetching TON wallet data', { 
      addressPreview: address.substring(0, 8) + '...'
    });
    
    // Get the best available TON endpoint (using testnet for demo)
    const endpoint = 'https://testnet.toncenter.com/api/v2/jsonRPC';
    logger.debug('TON testnet endpoint', { endpoint });
    
    // Make direct HTTP request to TON API
    const response = await axios.post(endpoint, {
      id: 1,
      jsonrpc: "2.0",
      method: "getAddressInformation",
      params: {
        address: address
      }
    });
    
    const balance = response.data.result.balance;
    const balanceTON = parseFloat(balance) / 1000000000; // Convert from nanoTONs to TONs
    
    const duration = Date.now() - startTime;
    logger.info('TON wallet data retrieved successfully', {
      addressPreview: address.substring(0, 8) + '...',
      balanceTON,
      duration: `${duration}ms`
    });
    
    return {
      success: true,
      balance: balance.toString(),
      balanceTON: balanceTON,
      currency: 'TON',
      // For future expansion: tokens, transactions, etc.
      tokens: [], 
      totalValueUSD: null // Would need price API integration
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error fetching TON wallet data', {
      addressPreview: address.substring(0, 8) + '...',
      error: error.message,
      duration: `${duration}ms`,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message,
      balanceTON: 0,
      currency: 'TON'
    };
  }
}

/**
 * Placeholder for Ethereum wallet data (fallback)
 * @param {string} address - Ethereum wallet address
 * @returns {object} - Basic response structure
 */
async function getEthWalletData(address) {
  logger.warn('ETH wallet data requested but not implemented', {
    addressPreview: address.substring(0, 8) + '...'
  });
  
  return {
    success: false,
    error: 'Ethereum wallet support not implemented yet',
    balance: '0',
    balanceETH: 0,
    currency: 'ETH'
  };
}

/**
 * Main function to get wallet data based on detected type
 * @param {string} address - Wallet address
 * @param {string} type - 'TON' or 'ETH'
 * @returns {object} - Wallet data object
 */
async function getWalletData(address, type) {
  switch (type) {
    case 'TON':
      return await getTonWalletData(address);
    case 'ETH':
      return await getEthWalletData(address);
    default:
      logger.error('Unknown wallet type', { type, address: address.substring(0, 8) + '...' });
      return {
        success: false,
        error: `Unsupported wallet type: ${type}`,
        balance: '0'
      };
  }
}

/**
 * Format wallet data for user-friendly display
 * @param {object} walletData - Data from getWalletData
 * @param {string} type - Wallet type
 * @returns {string} - Formatted message for Telegram
 */
function formatWalletResponse(walletData, type) {
  if (!walletData.success) {
    return `❌ Sorry, I couldn't fetch your ${type} wallet data. ${walletData.error || 'Please try again later.'}`;
  }
  
  if (type === 'TON') {
    const balance = walletData.balanceTON.toFixed(2);
    
    if (walletData.balanceTON === 0) {
      return `💳 Your TON wallet is empty (0 TON).\n\nFeel free to ask me any crypto questions! When you have some TON, I can help analyze your holdings.`;
    }
    
    return `💳 **Your TON Wallet Analysis:**\n\n` +
           `💰 Balance: **${balance} TON**\n` +
           `${walletData.tokens && walletData.tokens.length > 0 ? `🪙 Tokens: ${walletData.tokens.length} different tokens\n` : ''}` +
           `\n🤔 **Want a personalized investment strategy?**\n` +
           `Just type "yes" and I'll analyze current market trends to suggest how you can grow your holdings!`;
  }
  
  return `📱 ${type} wallet detected, but this feature is coming soon!`;
}

/**
 * Validate if string looks like a valid wallet address
 * @param {string} address - Address to validate
 * @param {string} type - 'TON' or 'ETH'
 * @returns {boolean} - True if format is valid
 */
function isValidWalletAddress(address, type) {
  if (!address || typeof address !== 'string') return false;
  
  switch (type) {
    case 'TON':
      return TON_ADDRESS_REGEX.test(address) && address.length === 48;
    case 'ETH':
      return ETH_ADDRESS_REGEX.test(address) && address.length === 42;
    default:
      return false;
  }
}

/**
 * Format wallet data for user-friendly display with strategy CTA
 * @param {object} walletData - Data from getWalletData
 * @param {string} type - Wallet type
 * @returns {string} - Formatted message for Telegram with strategy CTA
 */
function formatWalletResponseWithStrategyCTA(walletData, type) {
  if (!walletData.success) {
    return `❌ Sorry, I couldn't fetch your ${type} wallet data. ${walletData.error || 'Please try again later.'}`;
  }
  
  if (type === 'TON') {
    const balance = walletData.balanceTON.toFixed(2);
    
    if (walletData.balanceTON === 0) {
      return `💳 **Your TON Wallet Analysis:**\n\n` +
             `💰 Balance: **0 TON** (Empty wallet)\n\n` +
             `💡 **Want personalized investment strategies?**\n` +
             `Even with an empty wallet, I can suggest the best entry points and DeFi opportunities.\n\n` +
             `**Just type "yes" to get tailored investment advice!**`;
    }
    
    return `💳 **Your TON Wallet Analysis:**\n\n` +
           `💰 Balance: **${balance} TON**\n` +
           `${walletData.tokens && walletData.tokens.length > 0 ? `🪙 Tokens: ${walletData.tokens.length} different tokens\n` : ''}` +
           `\n🚀 **Ready for a personalized investment strategy?**\n` +
           `I can analyze current market trends and suggest optimal moves for your ${balance} TON.\n\n` +
           `**Type "yes" to get your custom strategy, or "no" if you just want general crypto advice.**`;
  }
  
  return `📱 ${type} wallet detected, but this feature is coming soon!\n\n` +
         `**Type "yes" if you'd like strategy advice anyway, or ask me any crypto question!**`;
}

module.exports = {
  detectWalletAddress,
  getTonWalletData,
  getEthWalletData,
  getWalletData,
  formatWalletResponse,
  formatWalletResponseWithStrategyCTA,
  isValidWalletAddress
}; 