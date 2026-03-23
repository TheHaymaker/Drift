FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --production

RUN mkdir -p /data

EXPOSE 3377

CMD ["node", "server.js"]
