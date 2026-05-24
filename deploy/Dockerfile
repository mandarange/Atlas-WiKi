FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY dist ./dist
COPY docs ./docs
ENV ATLAS_WIKI_ROOT=/data
VOLUME ["/data"]
ENTRYPOINT ["node", "dist/cli/awiki.js"]
CMD ["doctor"]
