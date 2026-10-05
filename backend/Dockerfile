# Imagen base: Python 3.13 en una versión mínima de Debian
FROM python:3.13-slim

# No generar archivos .pyc y mostrar los logs al instante
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Primero solo las dependencias: Docker guarda esta capa en caché y
# no reinstala todo cada vez que cambias una línea de código.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Después el resto del código
COPY . .

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
