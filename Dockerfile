FROM node:20-alpine

# Install database client tools
RUN apk add --no-cache \
    mysql-client \
    mariadb-connector-c \
    postgresql-client \
    bash

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY src ./src

# Create backup directory
RUN mkdir -p /backups

# Set the entrypoint
CMD ["node", "src/index.js"]
