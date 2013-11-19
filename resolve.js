var semver = require('semver')
var range   = require('padded-semver').range
var peek    = require('level-peek')
var urlResolve = require('npmd-git-resolve')
var onlineResolve = require('./online')
var offlineResolve = require('./offline')

function all (db, module, cb) {
  var found = {}
  db.createValueStream({min: module + '!', max: module + '!~'})
    .on('data', function (data) {
      found[data.version] = data
    })
    .on('end', function () {
      cb(null, found)
    })
    .on('error', cb)
}

//TODO: add registry update resolve,
//that requests modules from the registry,
//freshining the local database.

function remoteResolve (module, vrange, opts, cb) {

  //if vrange is a http or git
  //download the bundle
  //note - you can download git via an archive...
  //then unpack to get package.json
  if(/^(git|http|\w+\/)/.test(vrange)) {
    console.error('GET', vrange)
    return urlResolve(vrange, opts, function (err, pkg) {
      if(err)
        console.error(err.stack)
      if(pkg)
        console.error(pkg.name+'@'+pkg.shasum)
      cb(err, pkg)
    })
  }
  else cb()
}



module.exports = function (db, config) {

  function correctResolve (module, vrange, opts, cb) {
    all(db, module, function (err, versions) {
      if(err) return cb(err)
      var ver = semver.maxSatisfying(Object.keys(versions), vrange, true)
      if(!ver)
        return cb(new Error('no module satified version:' + vrange))

      cb(null, versions[ver])
    })
  }

 function peekResolve (module, vrange, opts, cb) {
    if(!cb) cb = opts, opts = {}
    if(!cb) cb = vrange, vrange = '*'

    if(vrange == 'latest')
      vrange = '*'

    var r = range(vrange || '*')

    r = {
      min: module + '!'+(r.start || ''),
      max: module + '!'+(r.end || '~'),
    }

    peek.last(db, r, function (err, key, pkg) {
      if(err) return cb(err)

      if(!semver.satisfies(pkg.version, vrange || '*', true))
        return cb(new Error(module+'@'+pkg.version +'><'+ vrange))
      
      cb(null, pkg)
    })
  }

  return function (module, vrange, opts, cb) {
    if(!cb) throw new Error('expects cb')
    remoteResolve(module, vrange, opts, function (err, pkg) {
      if(pkg || err) return cb(err, pkg)
      if(opts.online)         return onlineResolve(module, vrange, opts, cb)
      if(opts.offline || !db) return offlineResolve(module, vrange, opts, cb)
      if(opts.correct)        return correctResolve(module, vrange, opts, cb)
      peekResolve(module, vrange, opts, function (err, pkg) {
        if(pkg) cb(null, pkg)
        else correctResolve(module, vrange, opts, cb)
      })
    })
  }
}
