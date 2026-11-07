# Production Dockerfile for Nevada Multi-Staff Digital NFC Platform
FROM node:20-alpine

WORKDIR /app

# Install dependencies first for layer caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Ensure upload and data directories exist
RUN mkdir -p public/uploads/avatars data

# Expose HTTP port
EXPOSE 3000

# Persistent volumes for uploaded avatars and data
VOLUME ["/app/data", "/app/public/uploads"]

# Run server
CMD ["node", "src/server.js"]

