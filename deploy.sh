#!/bin/bash

# Установка необходимых пакетов
sudo apt update
sudo apt install -y nginx nodejs npm

# Создание директорий
sudo mkdir -p /var/www/html
sudo mkdir -p /opt/bybit-aml-backend

# Копирование фронтенда
sudo cp -r frontend/* /var/www/html/

# Копирование бэкенда
sudo cp -r backend/* /opt/bybit-aml-backend/

# Настройка nginx
sudo cp nginx.conf /etc/nginx/sites-available/bybit-aml
sudo ln -s /etc/nginx/sites-available/bybit-aml /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# Установка зависимостей и запуск бэкенда
cd /opt/bybit-aml-backend
npm install
npm install -g pm2
pm2 start server.js --name bybit-aml

# Настройка автозапуска
pm2 startup
pm2 save

echo "Deployment completed!" 