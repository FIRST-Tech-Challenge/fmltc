FROM python:3.9
WORKDIR /app
COPY . /app
RUN pip install -r requirements.txt
EXPOSE 8080
CMD ["gunicorn", "app_engine:app", "-b", ":8080", "--timeout", "300"]