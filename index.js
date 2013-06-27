var range   = require('padded-semver').range
var peek    = require('level-peek')
var path    = require('path')
var pull    = require('pull-stream')
var inspect = require('util').inspect
var semver  = require('semver')
var cat     = require('pull-cat')
var urlResolve = require('npmd-git-resolve')

//experimenting with different installation resolve
//algs. the idea is to traverse the tree locally,
//figure out what is needed, and then install from
//cache if possible. Else, get the rest in just one
//bundle. (the registry can stream them into one 
//multipart or a tarball or something)

//I've implemented the basic algorithm that npm uses,
//and a greedy algorithm. the greedy algorithm
//would every module into $PWD/node_modules
//and only creates new node_modules directories
//when the version range specified is not available.

//testing with the trees for large projects, (such as npm and browserify)
//this may require 10-30% fewer installs

//opening the database, and running this the first time is pretty slow
//like 2 seconds to resolve browserify (50 modules)
//but when the cache is warm it's only 50 ms!


function resolvePackage (db, module, vrange, cb) {
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
    if(err) return cb(err)
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
  delete t.dependencies

  for(var k in _deps) {
    _deps[k].from = deps[k]
    clean(_deps[k])
  }

  t.dependencies = _deps

  return t
}

function resolveTree (db, module, version, cb) {

  resolvePackage(db, module, version, function (err, pkg) {
    cat([
      pull.values([pkg]),
      pull.depthFirst(pkg, function (pkg) {
        var deps = pkg.dependencies || {}
        pkg.tree = {}
        return pull.values(Object.keys(deps))
          .pipe(pull.asyncMap(function (name, cb) {
            //check if there is already a module that resolves this...

            //filter out versions that we already have.
            if(check(pkg, name, deps[name]))
              return cb()

            resolvePackage(db, name, deps[name], cb)
          }, 10))
    
          .pipe(pull.filter(function (_pkg) {
            if(!_pkg) return
            _pkg.parent = pkg
            pkg.tree[_pkg.name] = _pkg
            return pkg
          }))
      })
    ])
    .pipe(pull.drain(null, function () {
      cb(null, clean(pkg))
    }))
  })
}

function resolveTreeGreedy (db, module, version, cb) {

  resolvePackage(db, module, version, function (err, pkg) {
    var root = pkg
 
    return cat([
      pull.values([pkg]),
      pull.depthFirst(pkg, function (pkg) {
        var deps = pkg.dependencies || {}
        pkg.tree = {}
        return pull.values(Object.keys(deps))
          .pipe(pull.asyncMap(function (name, cb) {
            //check if there is already a module that resolves this...

            //filter out versions that we already have.
            if(check(pkg, name, deps[name]))
              return cb()
 
           resolvePackage(db, name, deps[name], function (err, _pkg) {
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
      })
    ])
    .pipe(pull.drain(null, function () {
      cb(null, clean(pkg))
    }))
  })
}

var resolve = exports = module.exports = 
function (db, module, version, opts, cb) {
  if(!cb)
    cb = opts, opts = {}
    if(opts && opts.greedy)
      resolveTreeGreedy(db, module, version, cb)
    else
      resolveTree(db, module, version, cb)
}

exports.resolveTree = resolveTree
exports.resolveTreeGreedy = resolveTreeGreedy

exports.db = function (db, config) {
  db.methods.resolve = {type: 'async'}
  db.resolve = function (module, opts, cb) {
    if(!cb) cb = opts, opts = {}
    var parts = module.split('@')
    resolve(
      db.sublevel('ver'), parts[0], parts[1] || '*',
      { greedy: opts.greedy || config.greedy },
      cb
    )
  }
}

exports.commands = function (db) {
  db.commands.resolve = function (config, cb) {
    if(!config._.length)
      return cb(new Error('expect module@version? argument'))

    db.resolve(config._[0],
    {greedy: config.greedy}, 
    function (err, tree) {
      if(err) return cb(err)
      console.log(JSON.stringify(tree, null, 2))
      cb()
    })
  }
}

