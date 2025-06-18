require('dotenv').config();
const axios = require('axios');

// Test configuration
const TEST_CONFIG = {
  // Your local server (make sure it's running)
  LOCAL_SERVER: 'http://localhost:3000',
  
  // Test user data (use YOUR Telegram user ID for real testing)
  TEST_USER: {
    id: process.env.TEST_CHAT_ID || 999999, // Use real chat ID if provided
    first_name: 'TestUser',
    username: 'testuser'
  },
  
  // Test messages to try
  TEST_MESSAGES: [
    '/start',
    'What is Bitcoin?',
    'Explain DeFi to me',
    'What are the latest crypto trends?'
  ]
};

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

// Simulate a Telegram webhook payload
function createTelegramPayload(messageText, messageId = Date.now()) {
  return {
    update_id: messageId,
    message: {
      message_id: messageId,
      from: {
        id: TEST_CONFIG.TEST_USER.id,
        first_name: TEST_CONFIG.TEST_USER.first_name,
        username: TEST_CONFIG.TEST_USER.username,
        is_bot: false
      },
      chat: {
        id: TEST_CONFIG.TEST_USER.id,
        first_name: TEST_CONFIG.TEST_USER.first_name,
        username: TEST_CONFIG.TEST_USER.username,
        type: 'private'
      },
      date: Math.floor(Date.now() / 1000),
      text: messageText
    }
  };
}

// Test individual message
async function testMessage(messageText) {
  log(colors.blue, `\n🧪 Testing message: "${messageText}"`);
  
  try {
    const payload = createTelegramPayload(messageText);
    
    log(colors.yellow, '📤 Sending to webhook...');
    const startTime = Date.now();
    
    const response = await axios.post(
      `${TEST_CONFIG.LOCAL_SERVER}/webhook/telegram`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 seconds timeout
      }
    );
    
    const duration = Date.now() - startTime;
    
    if (response.status === 200) {
      log(colors.green, `✅ Success! Response: ${response.status} (${duration}ms)`);
      log(colors.green, `📝 Response: ${response.data || 'OK'}`);
    } else {
      log(colors.red, `❌ Unexpected status: ${response.status}`);
    }
    
    return { success: true, status: response.status, duration };
    
  } catch (error) {
    const duration = Date.now() - Date.now();
    log(colors.red, `❌ Error: ${error.message}`);
    
    if (error.response) {
      log(colors.red, `📝 Response status: ${error.response.status}`);
      log(colors.red, `📝 Response data: ${JSON.stringify(error.response.data)}`);
    }
    
    return { success: false, error: error.message, duration };
  }
}

// Test server health
async function testHealth() {
  log(colors.blue, '🏥 Testing server health...');
  
  try {
    const response = await axios.get(`${TEST_CONFIG.LOCAL_SERVER}/health`);
    
    if (response.status === 200 && response.data.status === 'ok') {
      log(colors.green, '✅ Server is healthy!');
      log(colors.green, `📝 Response: ${JSON.stringify(response.data, null, 2)}`);
      return true;
    } else {
      log(colors.red, '❌ Server health check failed');
      return false;
    }
  } catch (error) {
    log(colors.red, `❌ Server health check failed: ${error.message}`);
    return false;
  }
}

// Test webhook setup endpoint
async function testWebhookSetup() {
  log(colors.blue, '🔗 Testing webhook setup endpoint...');
  
  try {
    const response = await axios.get(`${TEST_CONFIG.LOCAL_SERVER}/setup`);
    
    if (response.status === 200) {
      log(colors.green, '✅ Webhook setup successful!');
      log(colors.green, `📝 Response: ${JSON.stringify(response.data, null, 2)}`);
      return true;
    } else {
      log(colors.red, '❌ Webhook setup failed');
      return false;
    }
  } catch (error) {
    log(colors.red, `❌ Webhook setup failed: ${error.message}`);
    if (error.response && error.response.data) {
      log(colors.red, `📝 Error details: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

// Main test function
async function runFullFlowTest() {
  log(colors.bold + colors.blue, '🚀 TELEGRAM BOT FULL FLOW TEST');
  log(colors.blue, '=====================================\n');
  
  // Check environment variables
  log(colors.blue, '🔧 Checking configuration...');
  const requiredEnvVars = ['TELEGRAM_BOT_TOKEN', 'N8N_WEBHOOK_URL'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    log(colors.red, `❌ Missing environment variables: ${missingVars.join(', ')}`);
    log(colors.yellow, '💡 Make sure you have a .env file with the required variables');
    process.exit(1);
  }
  
  log(colors.green, `✅ TELEGRAM_BOT_TOKEN: ${process.env.TELEGRAM_BOT_TOKEN ? 'Set' : 'Missing'}`);
  log(colors.green, `✅ N8N_WEBHOOK_URL: ${process.env.N8N_WEBHOOK_URL ? 'Set' : 'Missing'}`);
  log(colors.green, `✅ PUBLIC_URL: ${process.env.PUBLIC_URL || 'Not set (optional for local testing)'}`);
  
  // Check if real Telegram testing is enabled
  if (process.env.TEST_CHAT_ID) {
    log(colors.green, `✅ TEST_CHAT_ID: Set (${process.env.TEST_CHAT_ID}) - REAL TELEGRAM MESSAGES WILL BE SENT!`);
    log(colors.yellow, '📱 Check your Telegram chat for responses during the test!');
  } else {
    log(colors.yellow, '⚠️  TEST_CHAT_ID not set - simulated testing only (no real Telegram messages)');
    log(colors.blue, '💡 To receive real messages, add TEST_CHAT_ID=your_telegram_user_id to .env');
  }
  
  // Test server health
  const healthOk = await testHealth();
  if (!healthOk) {
    log(colors.red, '❌ Server is not running or not healthy. Start the server first with: npm run dev');
    process.exit(1);
  }
  
  // Test webhook setup (optional)
  if (process.env.PUBLIC_URL) {
    await testWebhookSetup();
  } else {
    log(colors.yellow, '⚠️  Skipping webhook setup (PUBLIC_URL not set)');
  }
  
  // Test all messages
  log(colors.blue, '\n📨 Testing message processing...');
  const results = [];
  
  for (let i = 0; i < TEST_CONFIG.TEST_MESSAGES.length; i++) {
    const message = TEST_CONFIG.TEST_MESSAGES[i];
    const result = await testMessage(message);
    results.push({ message, ...result });
    
    // Wait between messages to avoid overwhelming the system
    if (i < TEST_CONFIG.TEST_MESSAGES.length - 1) {
      log(colors.yellow, '⏱️  Waiting 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // Test summary
  log(colors.bold + colors.blue, '\n📊 TEST SUMMARY');
  log(colors.blue, '=================');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  log(colors.green, `✅ Successful: ${successful}/${results.length}`);
  log(colors.red, `❌ Failed: ${failed}/${results.length}`);
  
  if (failed > 0) {
    log(colors.red, '\n❌ Failed tests:');
    results.filter(r => !r.success).forEach(r => {
      log(colors.red, `   - "${r.message}": ${r.error}`);
    });
  }
  
  if (successful === results.length) {
    log(colors.bold + colors.green, '\n🎉 ALL TESTS PASSED! Your bot is working correctly!');
  } else {
    log(colors.bold + colors.yellow, '\n⚠️  Some tests failed. Check the errors above.');
  }
  
  log(colors.blue, '\n💡 Next steps:');
  log(colors.blue, '   1. If tests passed: Try sending real messages to your Telegram bot');
  log(colors.blue, '   2. If tests failed: Check your n8n webhook and configuration');
  log(colors.blue, '   3. Monitor the console logs while testing for detailed information');
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${colors.bold}Telegram Bot Flow Tester${colors.reset}

Usage:
  node test-real-flow.js [options]

Options:
  --help, -h              Show this help message
  --single [message]      Test only one message (default or custom)
  --health                Test only server health
  --message "your text"   Test with a specific message

Examples:
  node test-real-flow.js                           # Run full test suite
  node test-real-flow.js --single                  # Test one default message
  node test-real-flow.js --message "Hello bot!"    # Test custom message
  node test-real-flow.js --health                  # Health check only

Environment Variables Required:
  TELEGRAM_BOT_TOKEN    Your Telegram bot token
  N8N_WEBHOOK_URL       Your n8n webhook URL
  TEST_CHAT_ID          Your Telegram user ID (for real message sending)
  PUBLIC_URL            (Optional) Your public app URL

Make sure your server is running before starting the test:
  npm run dev
`);
  process.exit(0);
}

// Find custom message
const messageIndex = args.indexOf('--message');
const customMessage = messageIndex !== -1 && args[messageIndex + 1] ? args[messageIndex + 1] : null;

if (args.includes('--health')) {
  testHealth();
} else if (customMessage) {
  log(colors.blue, `🎯 Testing custom message: "${customMessage}"`);
  testMessage(customMessage);
} else if (args.includes('--single')) {
  testMessage('Hello, this is a test message!');
} else {
  runFullFlowTest();
} 