FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++ 

WORKDIR /usr/src/app

COPY package.json package-lock.json ./

RUN npm install --legacy-peer-deps

# Copy entire workspace (Nx needs full monorepo context)
COPY . .

# Build backend using Nx
RUN npx nx build backend

FROM node:22-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist/apps/backend/main.js ./
COPY --from=builder /usr/src/app/dist/apps/backend/package.json ./

COPY --from=builder /usr/src/app/package-lock.json ./

RUN npm config set fetch-retries 5 && npm config set fetch-retry-mintimeout 20000 && \
    npm install --omit=dev --legacy-peer-deps || \
    npm install --omit=dev --legacy-peer-deps --ignore-scripts

RUN apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

EXPOSE 5000

CMD ["node", "main.js"]
