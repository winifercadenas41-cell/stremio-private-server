FROM node:20-alpine

WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm install --omit=dev

# Copiar el código fuente
COPY . .

# Crear directorio de datos persistente
RUN mkdir -p data

# Exponer el puerto
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "src/server.js"]
