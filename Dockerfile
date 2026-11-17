FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY templates ./templates
COPY public ./public
ENV PORT=8000
ENV CLINIC_DB=/data/clinic.db
EXPOSE 8000
CMD ["node", "src/server.js"]
