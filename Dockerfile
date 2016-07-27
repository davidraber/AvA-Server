FROM ubuntu:14.04

apt-get update
apt-get install -y curl
curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
apt-get install nodejs

EXPOSE 3000

WORKDIR /src
CMD node main.js
