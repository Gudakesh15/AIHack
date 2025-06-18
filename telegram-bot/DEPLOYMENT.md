# 🚀 Deployment Guide

This guide covers deploying the Telegram Bot Bridge to various cloud platforms.

## 📋 Prerequisites

1. **Telegram Bot Token**: Get from [@BotFather](https://t.me/botfather)
2. **n8n Webhook URL**: Your n8n instance webhook endpoint
3. **Git Repository**: Code pushed to GitHub/GitLab

## 🌐 Environment Variables

Required environment variables for all deployments:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/telegram-bot
PUBLIC_URL=https://your-deployed-app.com
PORT=3000
NODE_ENV=production
LOG_LEVEL=info
USER_RATE_LIMIT_WINDOW_MS=60000
USER_RATE_LIMIT_MAX_REQUESTS=5
```

---

## 🚂 Railway Deployment

Railway is the easiest deployment option with automatic CI/CD.

### Step 1: Setup Railway

1. Create account at [railway.app](https://railway.app)
2. Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   railway login
   ```

### Step 2: Deploy from GitHub

1. Connect your GitHub repository to Railway
2. Select the `telegram-bot` directory as root
3. Add environment variables in Railway dashboard
4. Deploy automatically triggers

### Step 3: Configure Environment

In Railway dashboard:
- Add all required environment variables
- Set `PUBLIC_URL` to your Railway app URL
- Enable auto-deploys from your main branch

### Step 4: Setup Webhook

After deployment:
```bash
railway run npm run setup
```

### Railway Configuration

The `railway.json` file includes:
- Health checks on `/health`
- Auto-restart on failure
- Production environment settings

---

## 🪁 Fly.io Deployment

Fly.io provides global edge deployment with auto-scaling.

### Step 1: Install Fly CLI

```bash
# macOS
brew install flyctl

# Linux/WSL
curl -L https://fly.io/install.sh | sh

# Login
fly auth login
```

### Step 2: Initialize App

```bash
cd telegram-bot
fly launch --no-deploy
```

This creates a `fly.toml` configuration file.

### Step 3: Set Secrets

```bash
fly secrets set \
  TELEGRAM_BOT_TOKEN="your_bot_token" \
  N8N_WEBHOOK_URL="https://your-n8n.com/webhook/telegram-bot"
```

### Step 4: Deploy

```bash
fly deploy
```

### Step 5: Setup Webhook

```bash
fly ssh console -C "npm run setup"
```

### Fly.io Features

- Global edge deployment
- Auto-scaling (0-N instances)
- Health checks and auto-recovery
- HTTPS by default

---

## 🐳 Docker Deployment

For custom hosting or Kubernetes.

### Build Image

```bash
npm run docker:build
```

### Run Container

```bash
npm run docker:run
```

### Production Docker Run

```bash
docker run -d \
  --name telegram-bot \
  --restart unless-stopped \
  -p 3000:3000 \
  -e TELEGRAM_BOT_TOKEN="your_token" \
  -e N8N_WEBHOOK_URL="your_webhook" \
  -e PUBLIC_URL="https://your-domain.com" \
  telegram-bot-bridge
```

### Docker Compose

```yaml
version: '3.8'
services:
  telegram-bot:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - N8N_WEBHOOK_URL=${N8N_WEBHOOK_URL}
      - PUBLIC_URL=${PUBLIC_URL}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 30s
      timeout: 3s
      retries: 3
```

---

## 🔧 Manual Server Deployment

For VPS or dedicated servers.

### Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2
```

### Step 2: Deploy Code

```bash
# Clone repository
git clone https://github.com/your-username/your-repo.git
cd your-repo/telegram-bot

# Install dependencies
npm ci --only=production
```

### Step 3: Configure Environment

```bash
# Create production environment file
cp .env.example .env
nano .env
```

### Step 4: Start with PM2

```bash
# Start the application
pm2 start index.js --name telegram-bot

# Setup auto-restart on boot
pm2 startup
pm2 save
```

### Step 5: Setup Webhook

```bash
npm run setup
```

---

## 🔍 Monitoring & Logs

### Railway
- View logs in Railway dashboard
- Metrics automatically tracked

### Fly.io
```bash
# View logs
fly logs

# Connect to machine
fly ssh console
```

### Docker
```bash
# View logs
docker logs telegram-bot

# Follow logs
docker logs -f telegram-bot
```

### PM2
```bash
# View logs
pm2 logs telegram-bot

# Monitor
pm2 monit
```

---

## 🛡️ Security Considerations

1. **Environment Variables**: Never commit secrets to git
2. **HTTPS**: All platforms provide HTTPS by default
3. **Rate Limiting**: Built-in user and IP rate limiting
4. **Non-root User**: Docker runs as non-root user
5. **Health Checks**: All platforms have health monitoring

---

## 🔧 Troubleshooting

### Common Issues

1. **Webhook Registration Fails**
   - Check `TELEGRAM_BOT_TOKEN` is correct
   - Verify `PUBLIC_URL` is accessible
   - Ensure HTTPS is enabled

2. **n8n Connection Issues**
   - Verify `N8N_WEBHOOK_URL` is correct
   - Check n8n instance is running
   - Test webhook manually

3. **Rate Limiting Too Strict**
   - Adjust `USER_RATE_LIMIT_MAX_REQUESTS`
   - Modify `USER_RATE_LIMIT_WINDOW_MS`

### Health Check

Test deployment health:
```bash
curl https://your-app.com/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "TON AI Telegram Bot Bridge"
}
```

---

## 📊 Performance Optimization

### Railway/Fly.io
- Auto-scaling handles load automatically
- Consider upgrading to larger instances for high traffic

### Docker/VPS
- Use PM2 cluster mode for multiple cores:
  ```bash
  pm2 start index.js -i max --name telegram-bot
  ```

### Monitoring
- All logs are structured JSON for easy analysis
- Consider log aggregation tools for production

---

**🎉 Your bot is now production-ready!** 