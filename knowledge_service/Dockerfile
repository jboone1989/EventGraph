FROM python:3.12-slim
WORKDIR /app
COPY knowledge_service/requirements.txt .
RUN pip install --no-cache-dir --index-url https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
COPY knowledge_service/server.py knowledge_service/embedding_batches.py ./
EXPOSE 8000
CMD ["uvicorn","server:app","--host","0.0.0.0","--port","8000"]
