'use strict'

const methods = require('../../wwebjs/legacy/messageMethods')
const { pickMethods } = require('../pickMethods')

module.exports = pickMethods(methods, [
  'deleteMessage',
  'edit',
  'forward',
  'react',
  'reply',
  'star',
  'unstar'
])
