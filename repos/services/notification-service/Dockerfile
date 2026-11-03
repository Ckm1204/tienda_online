FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm@12.16.1 && pnpm install --frozen-lockfile=false && pnpm --filter @tiendita/notification-service build
EXPOSE 3013
ENV PORT=3013
CMD ["node", "services/notification-service/dist/server.js"]
