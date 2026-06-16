FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5050

ENV PORT=5050

CMD ["npx", "tsx", "app.js"]
