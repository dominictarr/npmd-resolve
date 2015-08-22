var spawn = require('child_process').spawn
var querystring = require('querystring')
var url = require('url')
var util = require('util')
var semver = require('semver')
var request = require('request')

var TOKEN
function fillCredential(opts, cb) {
  if(TOKEN)
    return process.nextTick(function() { cb(null, TOKEN) })

  var gc = spawn('git', ['credential', 'fill'])

  var out = ''
  gc.stdout.setEncoding('utf8')
  gc.stdout.on('data', function(s) { out += s })

  var err = ''
  gc.stderr.setEncoding('utf8')
  gc.stderr.on('data', function(s) { out += s })

  gc.on('close', function(code) {
    if(code !== 0) return cb(new Error(err.trim()))

    var creds = querystring.parse(out.trim(), '\n')
    if(creds.password !== 'x-oauth-basic')
      return cb(new Error('Expected token from git credential'))

    // TODO: Vary token cache by host
    cb(null, TOKEN = creds.username)
  })

  gc.stdin.end(querystring.stringify(opts, '\n'))
}

function findReleaseInRange(owner, repo, vrange, cb) {
  // TODO: GitHub Enterprise support
  fillCredential({ host: 'github.com '}, function(err, token) {
    if(err) return cb(err)

    request({
      url: 'https://api.github.com/repos/' + owner + '/' + repo + '/releases',
      headers: {
        'accept': 'application/vnd.github.v3+json',
        'user-agent': 'dominictarr/npmd-resolve',
        'authorization': 'token ' + token
      }
    }, function(err, res, data) {
      if(err) return cb(err)

      if(res.statusCode !== 200)
        return cb(new Error('Unexpected ' + res.statusCode + ' response code'))

      // TODO: Pagination
      try { data = JSON.parse(data) } catch (err) { return cb(err) }
      var tag = semver.maxSatisfying(
        data.map(function(r) { return r.tag_name }).filter(semver.valid),
        vrange)

      if(!tag) return cb(new Error('Cannot find release for range ' + vrange))
      cb(null, tag)
    })
  })
}

function getPackage(owner, repo, tag, cb) {
  fillCredential({ host: 'github.com '}, function(err, token) {
    if(err) return cb(err)

    request({
      url: 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/package.json?ref=' + tag,
      headers: {
        'accept': 'application/vnd.github.v3+json',
        'user-agent': 'dominictarr/npmd-resolve',
        'authorization': 'token ' + token
      }
    }, function(err, res, data) {
      if(err) return cb(err)

      if(res.statusCode !== 200)
        return cb(new Error('Unexpected ' + res.statusCode + ' response code'))

      try { data = JSON.parse(data) } catch (err) { return cb(err) }

      if(data.type !== 'file')
        return cb(new Error('Expected package.json to be a file, was a' + data.type))

      var pkg
      try {
        pkg = JSON.parse(new Buffer(data.content, data.encoding))
      } catch (err) {
        return cb(err)
      }

      // FIXME: If the repository is private, npmd-cache still won't be able to fetch it
      pkg.from = util.format('git://github.com/%s/%s.git#%s', owner, repo, tag)
      cb(null, pkg)
    })
  })
}

module.exports = function (module, vrange, opts, cb) {
  var parsed = url.parse(vrange)
  if(parsed.protocol !== 'github:')
    return cb()


  vrange = parsed.hash.slice(1)
  if(!semver.validRange(vrange))
    return cb()

  var p = parsed.pathname.split('/')
  var owner = p[1], repo = p[2]

  findReleaseInRange(owner, repo, vrange, function(err, tag) {
    if(err) return cb(err)

    getPackage(owner, repo, tag, cb)
  })
}
