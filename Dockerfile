FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 4201
CMD ["npm", "run", "start", "--", "--host", "0.0.0.0", "--port", "4201"]
