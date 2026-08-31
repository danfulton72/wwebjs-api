'use strict'

const pickMethods = (source, names) => Object.fromEntries(
  names.map((name) => {
    if (typeof source[name] !== 'function') {
      throw new TypeError(`Controller method ${name} is not implemented`)
    }
    return [name, source[name]]
  })
)

module.exports = { pickMethods }
