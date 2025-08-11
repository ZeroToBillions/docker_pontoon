# build stage
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
# Install dependencies (including devDependencies needed for Vite build)
RUN npm install
# Ensure vite react plugin is present (some contexts may miss this); install explicitly if absent
RUN npm install @vitejs/plugin-react@^4.0.0 --save-dev || true
COPY . .
RUN npm run build

# production stage
FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]