FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
ENV npm_config_nodedir=/usr/local
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3333
COPY --from=build --chown=node:node /app/build/ ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
RUN mkdir -p tmp && chown node:node tmp
USER node
EXPOSE 3333
CMD ["node", "bin/server.js"]
