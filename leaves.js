var pt   = require('pull-traverse')
var pull = require('pull-stream')
var hash = require('shasum')

function compare(a, b) {
  return a < b ? -1 : a === b ? 0 : 1
}

function isEmpty(obj) {
  for(var k in obj)
    return false
  return true
}

function map(obj, m) {
  var a = []
  for(var k in obj)
    a.push(m(obj[k], k, obj))
  return a
}

function leafFirst(tree) {
   return pull(pt.leafFirst(tree, function (tree) {
    return pull.values(tree.dependencies)
  }), pull.filter())
}

function collect(field, cb) {
  return pull.reduce(function (set, pkg) {
    set[pkg[field]] = pkg
    return set
  }, {}, function (err, ary) {
    cb(err, ary)
  })
}


//hash the deps through the tree.

module.exports = 
function (tree, cb) {
  return pull(
    leafFirst(tree),
    pull.through(function (pkg) {
      var m = map(pkg.dependencies, function (pkg) {
        return pkg.shasumDeps || pkg.shasum
      }).sort()
      if(m.length) {
        m.unshift(pkg.shasum)
        m.join(',')
        var deps = pkg.dependencies
        if(m) pkg.shasumDeps = hash(m)
        delete pkg.dependencies
        pkg.dependencies = deps
      }
      //some packages don't seem to have shasum - old stuff that I have replicated?
      pkg.hash = pkg.shasumDeps || pkg.shasum || pkg.name + '@' + pkg.version
    }),
    pull.map(function (pkg) {

      var _deps = {}, deps = pkg.dependencies
      var ret = {
        name: pkg.name, version: pkg.version,
        hash: pkg.hash,
        shasum: pkg.shasum
      }

      if(!isEmpty(deps)) {
        Object.keys(deps).sort().forEach(function (name) {
          _deps[name] = deps[name].hash
        })
        ret.dependencies = _deps
      }

      return ret
    }),
    pull.unique('hash'),
    collect('hash', cb)
  )
}

