# Use official Node.js 18 Alpine image for smaller size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies with clean install for production
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code
COPY . .

# Create logs directory and set permissions
RUN mkdir -p logs && \
    chown -R appuser:nodejs /app

# Set environment to production
ENV NODE_ENV=production

# Switch to non-root user
USER appuser

# Expose the port
EXPOSE 3000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD node healthcheck.js || exit 1

# Start the application
CMD ["node", "index.js"] 