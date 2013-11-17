var semver = require('semver')
var fs = require('fs')
var path = require('path')
var range   = require('padded-semver').range
var peek    = require('level-peek')

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

module.exports = resolvePackage

function resolvePackage (db, module, vrange, opts, cb) {
  if(!cb) cb = opts, opts = {}
  if(!cb) cb = vrange, vrange = '*'

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
    //if vrange is a http or git
    //download the bundle
    //note - you can download git via an archive...
    //then unpack to get package.json
    //

  if(vrange == 'latest')
    vrange = '*'

  if(opts.correct === true) {

    all(db, module, function (err, versions) {
      if(err) return cb(err)
      var ver = semver.maxSatisfying(Object.keys(versions), vrange, true)
      if(!ver)
        return cb(new Error('no module satified version:' + vrange))
      if(opts.offline)
        return fs.readdir(path.join(process.env.HOME, '.npm', module), function (err, list) {
          var ver = semver.maxSatisfying(list, vrange, true)
          if(!ver)
            return cb(new Error('no module satified version:' + vrange))
          fs.readFile(path.join(process.env.HOME, '.npm', module, 'package', 'package.json'), 'utf-8',
            function (err, json) {
              if(err) return cb(err)
              try { json = JSON.parse(json) } catch (err) { return cb(err) }
              cb(null, json)
            })
        })
    
      cb(null, versions[ver])

    })

  } else {
    var r = range(vrange || '*')

    r = {
      min: module + '!'+(r.start || ''),
      max: module + '!'+(r.end || '~'),
    }

    peek.last(db, r, function (err, key, pkg) {
      if(err) {
          console.log(r, vrange)
          return cb(err)
      }
      if(!semver.satisfies(pkg.version, vrange || '*', true)) {
        return cb(new Error(module+'@'+pkg.version +'><'+ vrange))
      }
      cb(null, pkg)
    })
  }
}

