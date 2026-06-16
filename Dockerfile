FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx tsx --version

EXPOSE 5000

CMD ["node", "--require", "tsx/cjs", "app.js"]
