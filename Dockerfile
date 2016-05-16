FROM node:5
MAINTAINER Karl Fritsche <karl.fritsche@kairion.de>
EXPOSE 3000
CMD ["npm","start"]

WORKDIR /srv/www/app
ADD ./ /srv/www/app

RUN npm install
RUN npm test