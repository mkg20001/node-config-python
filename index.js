'use strict'

var fs = require('fs')
var sfs = require('safe-replace').create()

function snakeCase (key) {
  // TODO let user supply list of exceptions
  if (key === 'tlsSni01Port') {
    return 'tls_sni_01_port'
  }
  /*
  else if ('http01Port' === key) {
    return 'http01-port';
  }
  */
  else {
    return key.replace(/([A-Z])/g, '_$1').toLowerCase()
  }
}

function uc (match, c) {
  return c.toUpperCase()
}

function camelCase (key) {
  return key.replace(/_([a-z0-9])/g, uc)
}

function parsePythonConf (str, cb) {
  var keys = {}
  var obj = {}
  var lines = str.split('\n')

  lines.forEach(function (line, i) {
    line = line.replace(/#.*/, '').trim()

    if (!line) { return }

    var parts = line.trim().split('=')
    var pykey = parts.shift().trim()
    var key = camelCase(pykey)
    var val = parts.join('=').trim()

    if (val === 'True') {
      val = true
    } else if (val === 'False') {
      val = false
    } else if (val === 'None') {
      val = null
    } else if (/,/.test(val) && !/^"[^"]*"$/.test(val)) {
      val = val.split(',')
    } else if (/^[0-9]+$/.test(val)) {
      val = parseInt(val, 10)
    }

    obj[key] = val
    if (typeof keys[key] !== 'undefined') {
      console.warn("unexpected duplicate key '" + key + "': '" + val + "'")
    }

    keys[key] = i
  })

  // we want to be able to rewrite the file with comments, etc
  obj.__keys = keys
  obj.__lines = lines

  cb(null, obj)
}

function toPyVal (val) {
  if (val === null) {
    return 'None'
  } else if (val === true) {
    return 'True'
  } else if (val === false) {
    return 'False'
  } else if (typeof val === 'string') {
    return val
  } else if (typeof val === 'number') {
    return val
  } else if (Array.isArray(val)) {
    val = val.join(',')
    if (val.indexOf(',') === -1) {
      val += ',' // disambguates value from array with one element
    }
    return val
  }

  return val && JSON.stringify(val)
}

function stringifyPythonConf (obj, cb) {
  var endline

  // nix the final newline
  if (!obj.__lines[obj.__lines.length - 1].trim()) {
    endline = obj.__lines.pop()
  }

  Object.keys(obj).forEach(function (key) {
    if (key.slice(0, 2) === '__') {
      return
    }

    var pykey = snakeCase(key)
    var pyval = toPyVal(obj[key])
    var num = obj.__keys[key]
    var comment = ''

    if (typeof pyval === 'undefined') {
      if (typeof num === 'number') {
        obj.__lines[num] = '___DELETE_ME___'
      }
      return
    }

    if (typeof num !== 'number') {
      obj.__lines.push(pykey + ' = ' + pyval)
      obj.__keys[key] = obj.__lines.length - 1
      return
    }

    if (pykey[0] === '[') {
      return
    }

    if (!obj.__lines[num] || !obj.__lines[num].indexOf) {
      console.warn('[pyconf] WARN index past array length:')
      console.log(obj.__lines.length, num, obj.__lines[num])
      return
    }

    // restore comments
    if (obj.__lines[num].indexOf('#') !== -1) {
      comment = obj.__lines[num].replace(/.*?(\s*#.*)/, '$1')
    }

    if (typeof pyval === 'undefined') {
      obj.__lines[num] = '___DELETE_ME___'
    } else {
      obj.__lines[num] = pykey + ' = ' + pyval + comment
    }
  })

  obj.__lines = obj.__lines.filter(function (line) {
    if (line !== '___DELETE_ME___') {
      return true
    }
  })

  if (typeof endline === 'string') {
    obj.__lines.push(endline)
  }

  cb(null, obj.__lines.join('\n'))
}

function writePythonConfFile (pathname, obj, cb) {
  // TODO re-read file?
  stringifyPythonConf(obj, function (err, text) {
    sfs.writeFileAsync(pathname, text, 'utf8').then(function () {
      cb(null, null)
    }, function (err) {
      cb(err)
    })
  })
}

function parsePythonConfFile (pathname, cb) {
  fs.readFile(pathname, 'utf8', function (err, text) {
    if (err) {
      cb(err)
      return
    }

    parsePythonConf(text, cb)
  })
}

module.exports.parse = parsePythonConf
module.exports.readFile = parsePythonConfFile
module.exports.stringify = stringifyPythonConf
module.exports.writeFile = writePythonConfFile
