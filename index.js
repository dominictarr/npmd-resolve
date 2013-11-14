var range   = require('padded-semver').range
var peek    = require('level-peek')
var path    = require('path')
var pull    = require('pull-stream')
var pt      = require('pull-traverse')
var inspect = require('util').inspect
var semver  = require('semver')
var cat     = require('pull-cat')
var urlResolve = require('npmd-git-resolve')
var clean    = require('./clean')
var ls       = require('npmd-tree').ls
var paramap  = require('pull-paramap')
var deps     = require('get-deps')

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

//however, I've recently moved on to a technique
//that simlinks every module.
//this allows exact control of the code in your dep tree
//and also, it's really really fast.

//see npmd-leaves and npmd-link 

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

  var r = range(vrange || '*')

  r = {
    min: module + '!'+(r.start || ''),
    max: module + '!'+(r.end || '~'),
  }

  peek.last(db, r, function (err, key, pkg) {
    if(err) return cb(err)
    if(!semver.satisfies(pkg.version, vrange)) {
      return cb(new Error(module+'@'+pkg.version +'><'+ vrange))
    }
    cb(null, pkg)
  })
}

function check(pkg, name, range) {
  if(!pkg) return false
  if(pkg.tree[name] && semver.satisfies(pkg.tree[name].version, range))
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

function resolveTree (db, module, opts, cb) {

  module = fixModule(module)

  var filter = opts.filter || function (pkg, root) {
    if(!pkg) return
    pkg.parent.tree[pkg.name] = pkg
  }

  if (! module) return cb(null, {})

  resolvePackage(db, module.name, module.version, function (err, pkg) {
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

            resolvePackage(db, name, deps[name], cb)
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

function resolveTreeGreedy (db, module, opts, cb) {
  if(!cb) cb = opts, opts = null

  opts = opts || {}
  opts.filter = function (pkg, root) {
    if(!pkg) return
    //install non-conflicting modules as low in the tree as possible.
    //hmm, is this wrong?
    //hmm, the only way a module is not on the root is if it's
    //conflicting with one that is already there.
    //so, what if this module is a child of a conflicting module
    //aha! we have already checked the path to the root,
    //and this item would be filtered if it wasn't clear.
    if(!root.tree[pkg.name]) {
      root.tree[pkg.name] = pkg
      pkg.parent = root
    }
    else {
      pkg.parent.tree[pkg.name] = pkg
    }
    return pkg
  }

  resolveTree(db, module, opts, cb)
}

var resolve = exports = module.exports = 
function (db, module, opts, cb) {
  if(!cb)
    cb = opts, opts = {}

  function resolve(module, cb) {
    if(opts && opts.greedy)
      resolveTreeGreedy(db, module, opts, cb)
    else
      resolveTree(db, module, opts, cb)
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

exports.resolveTree = resolveTree
exports.resolveTreeGreedy = resolveTreeGreedy

exports.db = function (db, config) {
  db.methods.resolve = {type: 'async'}
  db.resolve = function (module, opts, cb) {
    if(!cb) cb = opts, opts = {}
    if(opts.hash)
      opts.greedy = false
    resolve(
      db.sublevel('ver'), module,
      opts,
      cb
    )
  }
}

exports.cli = function (db) {
  db.commands.push(function (db, config, cb) {
    var args = config._.slice()
    var cmd = args.shift()
    
    if(cmd === 'resolve') {
      if(!args.length)
        args = deps(process.cwd(), config)

      ls(function (err, tree) {
        if(err) return cb(err)
        db.resolve(args, {
          greedy: config.greedy,
          available: tree
        },
        function (err, tree) {
          if(err) return cb(err)
          console.log(JSON.stringify(tree, null, 2))
          cb(null, tree)
        })
      })
      return true
    }

  })
}

