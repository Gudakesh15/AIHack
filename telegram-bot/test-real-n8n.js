const axios = require('axios');

async function testRealN8nFlow() {
  console.log('🧪 Testing real n8n flow...\n');
  
  // Mock Telegram message to test the full flow
  const mockTelegramMessage = {
    update_id: 123456789,
    message: {
      message_id: 1,
      from: {
        id: 999999999,
        is_bot: false,
        first_name: "TestUser",
        username: "testuser"
      },
      chat: {
        id: 999999999,
        first_name: "TestUser",
        type: "private"
      },
      date: Math.floor(Date.now() / 1000),
      text: "Hello, can you help me understand Bitcoin?"
    }
  };
  
  try {
    console.log('📤 Sending test message to Telegram webhook...');
    console.log(`Message: "${mockTelegramMessage.message.text}"`);
    
    const response = await axios.post('http://localhost:3000/webhook/telegram', mockTelegramMessage, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 20000 // 20 second timeout
    });
    
    console.log('\n✅ Telegram webhook responded successfully!');
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${response.data}`);
    
    console.log('\n🔍 Check your n8n instance for:');
    console.log('1. New execution in your workflow');
    console.log('2. Webhook trigger should show the message data');
    console.log('3. AI processing should begin');
    
    console.log('\n📋 Expected payload sent to n8n:');
    console.log(JSON.stringify({
      message: mockTelegramMessage.message.text,
      userId: mockTelegramMessage.message.from.id,
      source: 'telegram',
      timestamp: new Date().toISOString()
    }, null, 2));
    
  } catch (error) {
    console.log('\n❌ Error testing flow:');
    
    if (error.code === 'ECONNABORTED') {
      console.log('⏱️  Request timed out - this might mean n8n is processing but taking a while');
    } else if (error.response) {
      console.log(`HTTP Error: ${error.response.status}`);
      console.log(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.log(`Error: ${error.message}`);
    }
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check if N8N_WEBHOOK_URL is set correctly in .env');
    console.log('2. Verify your n8n instance is running and accessible');
    console.log('3. Check n8n webhook URL is correct');
    console.log('4. Look at bot server logs above for more details');
  }
}

testRealN8nFlow(); 