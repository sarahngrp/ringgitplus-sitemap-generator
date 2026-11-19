FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY . .

ENTRYPOINT ["node", "index.js"]
