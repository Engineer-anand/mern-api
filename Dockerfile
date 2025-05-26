FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Port must match the app.listen() port
EXPOSE 5000

CMD ["node", "server.js"]

