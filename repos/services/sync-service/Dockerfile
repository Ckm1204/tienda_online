FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm@12.16.1 && pnpm install --frozen-lockfile=false && pnpm --filter @tiendita/sync-service build
EXPOSE 3006
ENV PORT=3006
CMD ["node", "services/sync-service/dist/server.js"]
