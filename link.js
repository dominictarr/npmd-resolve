var pull    = require('pull-stream')
var paramap = require('pull-paramap')
var path    = require('path')
var unpack  = require('npmd-unpack').unpack
var mkdirp  = require('mkdirp')
var fs      = require('fs')
var leaves  = require('./leaves')

function linkable(pkg, opts) {
  var linkRoot = opts.linkRoot
    || path.join(process.env.HOME, '.npmd', 'linkable')
  return path.join(linkRoot, 'string' === typeof pkg ? pkg : pkg.hash)
}

//install a module with a symlink.
//adds $moduleDir/node_modules/$name -> $hash

function linkModule(moduleDir, name, hash, opts, cb) {
  if(!cb)
    cb = opts, opts = {}
  name = name.name || name
  var source = path.join(moduleDir, 'node_modules', name)
  var target = path.join(linkable(hash, opts), 'package')

  fs.readlink (source, function (err, found) {
    if(found === target)
      done()
    else if(err)
      fs.symlink(target, source, done)
    else 
      fs.unlink(source, function (err) {
        if(err) return cb(err)
        fs.symlink(target, source, done)
      })
  })

  function done (err) {
    if(err) {
      err.source = source
      err.target = target
    }
    cb(err)
  }
}

var link = 
module.exports = function (ltree, opts, cb) {
  if(!cb)
    cb = opts, opts = {}
  var dirs = {}
  var linked = {}
  pull(
    pull.values(ltree),
    paramap(function (pkg, cb) {
      var dir = linkable(pkg, opts)
      if(dirs[dir]) return cb(null, pkg)

      fs.stat(dir, function (err) {
        if(dirs[dir]) return cb(null, pkg)
        dirs[dir] = true
        if(!err) return console.log('already there', pkg.name), cb(null, pkg)
        unpack(pkg, {
          cache: opts.cache,
          target: dir
        }, function (err) {
          console.log('unpacked', pkg.name)
          cb(err, pkg)
        })
      })

    }),
    pull.asyncMap(function (pkg, cb) {
      //unpack to 
      //.npmd/linkable/HASH
      //then symlink to the deps
      var moduleDir = path.join(linkable(pkg), 'package')
      if(linked[pkg.hash]) return cb(null, pkg)
      linked[pkg.hash] = true
      mkdirp(path.join(moduleDir, 'node_modules'), function () {
        var n = 0
        for(var name in pkg.dependencies) {
          n ++
          linkModule(moduleDir, name, pkg.dependencies[name], next)
        }
        if(!n) cb()

        function next (err) {
          if(--n) return
          cb()
        }
      })
    }),
    pull.drain(null, function (err) {
      cb(err, ltree)
    })
  )
}

module.exports.db = function (db, config) {
  db.methods.lResolve = {type: 'async'}
  db.lResolve = function (module, opts, cb) {
    if(!cb)
      cb = opts, opts = {}

    opts.hash = true
    opts.check = false

    db.resolve(module, opts, function (err, tree) {
      leaves(tree, function (err, tree, root) {
          cb(err, tree, root)
      })
    })
  }
}

module.exports.commands = function (db) {
  var start = Date.now()
  db.commands.push(function (db, config, cb) {
    var args = config._.slice()
    var cmd = args.shift()

    if('link' === cmd) {
      db.lResolve(args.shift(), config, function (err, tree, root) {
        link(tree, function (err) {
          linkModule(process.cwd(), root.name, root.hash, cb)
        })
      })
    } else if('lresolve' === cmd) {
      db.lResolve(args.shift(), config, function (err, tree, root) {
        console.log(JSON.stringify(tree, null, 2))
        console.log(root)
        cb()
      })
    }
    else
      return false

    return true
  })
}
