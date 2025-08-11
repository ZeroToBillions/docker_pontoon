FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
# Use npm install instead of npm ci to avoid requiring package-lock.json in the image build
# and to allow installing production deps even if no lockfile is present.
RUN npm install --only=production
COPY . .
ENV PORT=4000
EXPOSE 4000
CMD ["node","index.js"]