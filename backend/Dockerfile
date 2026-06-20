FROM node:18-alpine

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存层
COPY package.json package-lock.json ./

# 安装生产依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
