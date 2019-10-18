FROM mhart/alpine-node:11.14
LABEL maintainer="mike.gales@siriusxm.com"
COPY . .
RUN  npm i typescript -g && npm i && tsc && rm -rf *.ts && rm -rf *.js.map
EXPOSE 5000
CMD node index.js
