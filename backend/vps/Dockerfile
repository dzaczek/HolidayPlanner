FROM node:20-alpine

WORKDIR /app

# Install native build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

# Persistent volume for SQLite database
VOLUME ["/data"]

ENV PORT=3000
ENV DB_PATH=/data/hcp.db

EXPOSE 3000

USER node

CMD ["node", "server.js"]
