// Executed only on first initialization of the local Compose Mongo volume.
const appPassword=process.env.MARKETLAB_MONGO_PASSWORD;
if(!appPassword||appPassword.length<24)throw new Error('Set a random MARKETLAB_MONGO_PASSWORD of at least 24 characters.');
db.getSiblingDB('marketlab').createUser({user:'marketlab_service',pwd:appPassword,roles:[{role:'readWrite',db:'marketlab'}]});
