FROM mhart/alpine-node:11.14
COPY . .
RUN npm run build && tsc && rm -rf *.ts && rm -rf *.js.map

