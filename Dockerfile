FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
ENV PORT=8000 HOST=0.0.0.0 CLINIC_DB=/data/clinic.db
VOLUME /data
EXPOSE 8000
CMD ["node", "src/server.js"]
