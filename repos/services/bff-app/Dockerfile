FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm@12.16.1 && pnpm install --frozen-lockfile=false && pnpm --filter @tiendita/bff-app build
EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0
CMD ["node", "services/bff-app/dist/server.js"]
