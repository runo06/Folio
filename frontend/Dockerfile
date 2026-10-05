# Imagen base: Node 24 (versión LTS) sobre Alpine Linux, que es muy liviano
FROM node:24-alpine

WORKDIR /app

# Igual que en el backend: primero solo las dependencias, para que Docker
# reutilice esta capa mientras package.json no cambie.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# --host hace que Vite escuche fuera del contenedor (si no, solo
# respondería dentro de él y tu navegador no podría entrar).
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
