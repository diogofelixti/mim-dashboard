FROM node:20-alpine

RUN apk add --no-cache python3 make g++ pkgconfig zeromq-dev

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

EXPOSE 3001

CMD ["node", "src/index.js"]
