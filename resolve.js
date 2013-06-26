function resolve (db, module, vrange, cb) {
  if(!cb) cb = vrange, vrange = '*'

  if(/^(git|http)/.test(vrange)) {
    console.error('GET', vrange)
    return urlResolve(vrange, function (err, pkg) {
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

  var r = range(vrange || '*')

  r = {
    min: module + '!'+(r.start || ''),
    max: module + '!'+(r.end || '~'),
  }

  peek.last(db, r, function (err, key, pkg) {
    if(!semver.satisfies(pkg.version, vrange))
      return cb(new Error(module+'@'+pkg.version +'><'+ vrange))
    cb(err, pkg)
  })
}

function check(pkg, name, range) {
  if(!pkg) return false
  if(pkg.tree[name] && semver.satisfies(pkg.tree[name].version, range))
    return true
  return check(pkg.parent, name, range)
}

function clean (t) {
  var deps = t.dependencies
  var _deps = t.tree || {}

  delete t.tree
  delete t._parent
  delete t.description
  delete t.devDependencies
  delete t.tree
  delete t.scripts
  delete t.parent
  delete t.time
  delete t.size

  for(var k in _deps) {
    _deps[k].from = deps[k]
    clean(_deps[k])
  }

  t.dependencies = _deps

  return t
}

function resolveTree (db, module, version, cb) {

  resolve(db, module, version, function (err, pkg) {
    cat([pull.values([pkg]),
      pull.depthFirst(pkg, function (pkg) {
        var deps = pkg.dependencies || {}
        pkg.tree = {}
        return pull.values(Object.keys(deps))
          .pipe(pull.asyncMap(function (name, cb) {
            //check if there is already a module that resolves this...

            //filter out versions that we already have.
            if(check(pkg, name, deps[name]))
              return cb()

            resolve(db, name, deps[name], cb)
          }, 10))
    
          .pipe(pull.filter(function (_pkg) {
            if(!_pkg) return
            _pkg.parent = pkg
            pkg.tree[_pkg.name] = _pkg
            return pkg
          }))
      })]
    )
    .pipe(pull.drain(null, function () {
      cb(null, clean(pkg))
    }))
  })
}

function resolveTreeGreedy (db, module, version, cb) {

  resolve(db, module, version, function (err, pkg) {
    var root = pkg
 
    cat([pull.values([pkg]),
    pull.depthFirst(pkg, function (pkg) {
      var deps = pkg.dependencies || {}
      pkg.tree = {}
      return pull.values(Object.keys(deps))
        .pipe(pull.asyncMap(function (name, cb) {
          //check if there is already a module that resolves this...

          //filter out versions that we already have.
          if(check(pkg, name, deps[name]))
            return cb()
 
         resolve(db, name, deps[name], function (err, _pkg) {
            cb(null, _pkg)
          })
        }))
    
        .pipe(pull.filter(function (_pkg) {
          if(!_pkg) return
          //install non-conflicting modules as low in the tree as possible.
          //hmm, is this wrong?
          //hmm, the only way a module is not on the root is if it's
          //conflicting with one that is already there.
          //so, what if this module is a child of a conflicting module
          //aha! we have already checked the path to the root,
          //and this item would be filtered if it wasn't clear.
          if(!root.tree[_pkg.name]) {
            root.tree[_pkg.name] = _pkg
            _pkg.parent = root
          }
          else {
            _pkg.parent = pkg
            pkg.tree[_pkg.name] = _pkg
          }
          return pkg
        }))
    })])
    .pipe(pull.drain(null, function () {
      cb(null, clean(pkg))
    }))
  })
}

module.exports = function (db, module, version, opts, cb) {
  if(!cb)
    cb = opts, opts = {}
    if(opts && opts.greedy)
      resolveTreeGreedy(db, module, version, cb)
    else
      resolveTree(db, module, version, cb)
}
