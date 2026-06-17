FROM node:20-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

FROM deps AS build

COPY . .
RUN npm run build

FROM node:20-alpine AS prod-deps

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine

WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json package-lock.json ./

ENV NODE_ENV=production
ENV PORT=8080
ENV DATABASE_URL=file:/tmp/aivoc.db

EXPOSE 8080

CMD ["npm", "run", "start"]
