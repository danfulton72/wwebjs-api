'use strict'

const methods = require('../../wwebjs/legacy/clientMethods')
const { pickMethods } = require('../pickMethods')

module.exports = pickMethods(methods, [
  'acceptInvite',
  'createGroup',
  'getInviteInfo'
])
