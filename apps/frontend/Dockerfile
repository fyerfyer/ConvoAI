FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .

# Build the application
RUN npx nx build frontend

FROM node:22-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV production
ENV PORT 3000

# Copy necessary files for standalone mode
COPY --from=builder /usr/src/app/apps/frontend/.next/standalone ./
COPY --from=builder /usr/src/app/apps/frontend/public ./apps/frontend/public
COPY --from=builder /usr/src/app/apps/frontend/.next/static ./apps/frontend/.next/static

EXPOSE 3000

CMD ["node", "apps/frontend/server.js"]
