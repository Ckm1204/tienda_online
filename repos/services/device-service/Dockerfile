FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm@12.16.1 && pnpm install --frozen-lockfile=false && pnpm --filter @tiendita/device-service build
EXPOSE 3003
ENV PORT=3003
CMD ["node", "services/device-service/dist/server.js"]
