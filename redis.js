
//
const redis = require('redis').createClient(process.env.REDIS_URL)
exports.set = function(key, data) {
  let json = JSON.stringify(data)
 // console.log('REDIS <set> key:', key, 'data:', data);
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
 //     console.log('REDIS <get> key:', key, 'data:', data);
      if (err) return reject(err)
      else resolve(data)
    })
  })
}