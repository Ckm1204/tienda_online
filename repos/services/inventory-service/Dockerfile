FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm@12.16.1 && pnpm install --frozen-lockfile=false && pnpm --filter @tiendita/inventory-service build
EXPOSE 3008
ENV PORT=3008
CMD ["node", "services/inventory-service/dist/server.js"]
