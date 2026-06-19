FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npx tsc --allowJs --outDir dist --module commonjs --target ES2020 --moduleResolution node --esModuleInterop true app.js

EXPOSE 8080
CMD ["node", "dist/app.js"]
