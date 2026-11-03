FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm@12.16.1 && pnpm install --frozen-lockfile=false && pnpm --filter @tiendita/catalog-service build
EXPOSE 3004
ENV PORT=3004
CMD ["node", "services/catalog-service/dist/server.js"]
