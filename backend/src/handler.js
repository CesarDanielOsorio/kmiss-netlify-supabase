const serverless = require('serverless-http');
const app = require('./app');

module.exports.handler = serverless(app, {
  basePath: '/.netlify/functions/api',
  request: (req, event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;
  },
});
