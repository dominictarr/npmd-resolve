var online = require('./online')
var offline = require('./offline')
var override = require('./override')

var path = require('path')

function cascade(methods) {
  return function () {
    var args = [].slice.call(arguments)
    var cb = args.pop()
    ;(function next (i) {
      methods[i].apply(null, args.concat(function (err, value) {
        if(err) return cb(err)
        if(value == null) return next(i + 1)
        cb(null, value)
      }))
    })(0)
  }
}

module.exports = function (cache, config) {
  config.dbPath = (config.dbPath || path.join(process.env.HOME, '.npmd'))

  return override(cascade([
    function (m, v, opts, cb) {
      if(opts.online === false || opts.offline)
        return offline(m, v, opts, cb)
      return online(m, v, opts, function (err, pkg) {
        if(err && err.code === 'ENOTFOUND') {
          console.error('npmd: network is ENOTFOUND. fallback to offline resolution')
          opts.offline = true
          return offline(m, v, opts, cb)
        }
        cb(err, pkg)
      })
    },
    cache.resolve,
    function (m, v, opts, cb) {
      cb(new Error(
        'could not resolve ' + m + '@' + v
         + (opts.maxTimestamp ? '\n  (published before: ' + opts.maxTimestamp + ')' : '')))
    }
  ]))
}

if(!module.parent) {
  var opts = require('minimist')(process.argv.slice(2))
  var parts = opts._[0].split('@')
  var resolve = module.exports(null, opts)

  resolve(parts[0], parts[1], opts, function (err, pkg) {
    if(err) throw err
    console.log(JSON.stringify(pkg, null, 2))
  })
}
