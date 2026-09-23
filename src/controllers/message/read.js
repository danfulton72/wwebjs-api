'use strict'

const methods = require('../../wwebjs/legacy/messageMethods')
const { pickMethods } = require('../pickMethods')

module.exports = pickMethods(methods, [
  'getClassInfo',
  'getContact',
  'getGroupMentions',
  'getInfo',
  'getMentions',
  'getOrder',
  'getPayment',
  'getPollVotes',
  'getQuotedMessage',
  'getReactions'
])
