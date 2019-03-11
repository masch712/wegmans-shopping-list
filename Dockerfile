FROM node:8.10

RUN \
  apt-get update -y \
  && apt-get install -y zip

RUN mkdir -p /usr/src/app

COPY ./package.json /usr/src/app
COPY ./package-lock.json /usr/src/app

WORKDIR /usr/src/app

RUN npm install typescript

COPY ./ /usr/src/app

# https://docs.aws.amazon.com/lambda/latest/dg/deployment-package-v2.html
RUN \
  npx tsc \
  && rm -rf ./node_modules \
  && npm install --production \
  && \find ./ -type f -exec chmod 644 {} \; \
  && find ./ -type d -exec chmod 755 {} \; \
  && zip -q -r build.zip ./node_modules ./config ./dist
