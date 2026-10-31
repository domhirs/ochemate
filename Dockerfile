# --- build Angular client ---
FROM node:24-alpine AS client
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npx ng build --configuration production

# --- server prod deps ---
FROM node:24-alpine AS deps
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# --- runtime ---
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/dartboard.db \
    STATIC_DIR=/app/public
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server/package.json server/server.js server/voices.js ./
COPY --from=client /client/dist/client/browser ./public
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
