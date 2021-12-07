FROM python:3.9
WORKDIR /app
COPY . /app
RUN pip install -r requirements.txt
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 main_cloud_run:app
