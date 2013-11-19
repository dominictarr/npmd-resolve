var pull    = require('pull-stream')
var pt      = require('pull-traverse')
var semver  = require('semver')
var cat     = require('pull-cat')
var clean    = require('./clean')
var paramap  = require('pull-paramap')

module.exports = createResolve

function check(pkg, name, range) {
  if(!pkg) return false
  if(pkg.tree[name] && semver.satisfies(pkg.tree[name].version, range, true))
    return true
  return check(pkg.parent, name, range)
}

function fixModule (module) {
  if('string' === typeof module) {
  var parts = module.split('@')
    return {name: parts.shift(), version: parts.shift() || '*'}
  }
  return module
}

function niceError(err, parent, name, range) {
  if(!err) return
  err.message = 'package:'
  + parent.name + '@' + parent.version
  + ' could not resolve '
  + name + '@' + range
  + '\n' + err.message

  return err
}

function createResolve (resolvePackage) {

  function resolveTree (module, opts, cb) {

    module = fixModule(module)

    var filter = opts.filter || function (pkg, root) {
      if(!pkg) return
      pkg.parent.tree[pkg.name] = pkg
    }

    if (! module) return cb(null, {})

    resolvePackage(module.name, module.version, opts, function (err, pkg) {
      if(err) return cb(err)
   
      var root = pkg

      if(opts.available) {
        root.parent = {tree: opts.available}
      }

      pull(cat([
        pull.values([pkg]),
        pt.depthFirst(pkg, function (pkg) {
          var deps = pkg.dependencies || {}
          pkg.tree = {}
          return pull(
            pull.values(Object.keys(deps)),
            //this could be parallel,
            //but it's not the bottle neck.
            paramap(function (name, cb) {
              //check if there is already a module that resolves this...

              //filter out versions that we already have.
              //if(opts.check !== false && check(pkg, name, deps[name]))
              //  return cb()

              resolvePackage(name, deps[name], opts, function (err, _pkg) {
                cb(niceError(err, pkg, name, deps[name]), _pkg)
              })
            }),
            pull.filter(),
            pull.through(function (_pkg) {
              _pkg.parent = pkg
              filter(_pkg, root)
            })
          )
        })
      ]),
      pull.drain(null, function (err) {
        cb(err, clean(pkg))
      }))
    })
  
  }

  //install non-conflicting modules as low in the tree as possible.
  function resolveTreeGreedy (module, opts, cb) {
    if(!cb) cb = opts, opts = null

    opts = opts || {}
    opts.filter = function (pkg, root) {
      if(!pkg) return
      if(!root.tree[pkg.name]) {
        root.tree[pkg.name] = pkg
        pkg.parent = root
      }
      else {
        pkg.parent.tree[pkg.name] = pkg
      }
      return pkg
    }

    resolveTree(resolvePackage, module, opts, cb)
  }

  return function (module, opts, cb) {
    if(!cb)
      cb = opts, opts = {}

    function resolve(module, cb) {
      if(opts && opts.greedy)
        resolveTreeGreedy(module, opts, cb)
      else
        resolveTree(module, opts, cb)
    }

    if(Array.isArray(module) && module.length > 1) {

      var n = module.length, a = {}

      module.forEach(function (m) {
        resolve(m, next)
      })

      function next (err, tree) {
        if(err) return n = 0, cb(err)
        a[tree.name] = tree
        if(--n) return
        cb(null, a)
      }

    } else {
      if(Array.isArray(module))
        module = module.shift()

      resolve(module, cb)
    }
  }
}

