FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx nx build backend
# Run prune to generate package.json with only necessary dependencies
# This command relies on the 'prune' target defined in project.json
RUN npx nx run backend:prune

FROM node:22-alpine

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist/apps/backend ./
RUN npm install --omit=dev

EXPOSE 3000

CMD ["node", "main.js"]
