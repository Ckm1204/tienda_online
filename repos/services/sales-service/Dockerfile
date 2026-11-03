FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm@12.16.1 && pnpm install --frozen-lockfile=false && pnpm --filter @tiendita/sales-service build
EXPOSE 3005
ENV PORT=3005
CMD ["node", "services/sales-service/dist/server.js"]
