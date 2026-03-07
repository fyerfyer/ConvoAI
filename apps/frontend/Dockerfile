FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Next.js NEXT_PUBLIC_ env vars are baked at build time
ARG NEXT_PUBLIC_API_URL=http://localhost:5000
ARG NEXT_PUBLIC_WS_URL=http://localhost:5000

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}

# Build the frontend using Nx
RUN npx nx build frontend

FROM node:22-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=3000

# Copy necessary files for standalone mode
COPY --from=builder /usr/src/app/apps/frontend/.next/standalone ./
COPY --from=builder /usr/src/app/apps/frontend/public ./apps/frontend/public
COPY --from=builder /usr/src/app/apps/frontend/.next/static ./apps/frontend/.next/static

EXPOSE 3000

CMD ["node", "apps/frontend/server.js"]
