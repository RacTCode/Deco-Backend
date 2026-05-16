FROM node:25-alpine

WORKDIR /usr/src/app

# Install dependencies based on the lockfile
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

CMD ["node", "index.js"]
