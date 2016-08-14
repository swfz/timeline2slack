try {
  var config = require('./.env.json')
  for (var key in config) {
    process.env[key] = config[key]
  }
} catch (err) {
  // ignore
}

// exports.handle = require('./sample').handle
var lambda = require('./sample_v2')
lambda.handle();

