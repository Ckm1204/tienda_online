FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm@12.16.1 && pnpm install --frozen-lockfile=false && pnpm --filter @tiendita/customer-service build
EXPOSE 3009
ENV PORT=3009
CMD ["node", "services/customer-service/dist/server.js"]
