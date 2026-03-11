FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 3377

CMD ["node", "server.js"]
