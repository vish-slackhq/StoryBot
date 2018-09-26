const redis = require('redis').createClient(process.env.REDIS_URL)
exports.set = function(key, data) {
  let json = JSON.stringify(data)
  return new Promise((resolve, reject) => {
    redis.set(key, json, (err, result) => {
      if (err) return reject(err)
      else resolve(data, result)
    })
  })
}
exports.get = function(key) {
  return new Promise((resolve, reject) => {
    redis.get(key, (err, result) => {
      let data = JSON.parse(result || "{}")
      if (err) return reject(err)
      else resolve(data)
    })
  })
}
exports.del = function(key) {
  return new Promise((resolve, reject) => {
    redis.del(key, (err, result) => {
      if (err) return reject(err)
      else resolve(result)
    })
  })
}