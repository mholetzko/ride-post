FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app
COPY server.py index.html app.js styles.css install.js invoice.html invoice.js invoice-pdf.js invoice.css manifest.webmanifest ./
COPY assets/ ./assets/
COPY vendor/ ./vendor/
USER 65532:65532
EXPOSE 8080
CMD ["python", "server.py"]
